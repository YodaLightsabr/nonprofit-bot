import { slackDecode } from './decode.js';
import env from './env.js';
import fetch from 'node-fetch';
import { reactions, react, staticReact } from './reactions.js';
import SlackBolt from '@slack/bolt';
import SlackWebAPI from '@slack/web-api';
import JSON5 from 'json5';

const { App } = SlackBolt;
const { WebClient } = SlackWebAPI;

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
});

function prettyTime (ms) {
    if (ms < 1000) return `${Math.floor(ms)}ms`;
    return `${Math.floor(ms / 1000)}s`;
}

const web = new WebClient(process.env.SLACK_BOT_TOKEN);

app.message(async ({ message, say }) => {
    let start = Date.now();

    const { loading, thumbsUp, failed, welcome } = staticReact();

    if (message.channel != 'C03JKV42ZQD') return console.log('Ignoring unrelated message');
    if (message.thread_ts && (message.thread_ts != message.ts)) return console.log('Ignoring threaded message');

    if (message.subtype === 'channel_join') {
        console.log('Reacting to and ignoring channel join message');

        await web.reactions.add({
            channel: message.channel,
            timestamp: message.ts,
            name: welcome
        });
        return;
    }

    if (message.subtype === 'message_changed') return console.log('Ignoring edited message'); // maybe implement in the future?
    if (message.text && (message.text.startsWith('#') || message.text.startsWith('//'))) return console.log('Ignoring comment message');

    let request = {};

    await web.reactions.add({
        channel: message.channel,
        timestamp: message.ts,
        name: loading
    });

    const normalized = message.text.trim()
        .split(`”`).join(`"`)
        .split(`“`).join(`"`)
        .split(`’`).join(`'`)
        .split(`‘`).join(`'`)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[\u2026]/g, '...');

    let jsonRequest;
    try {
        jsonRequest = JSON5.parse(normalized);
    } catch (err) {
        try {
            jsonRequest = JSON5.parse(`{${normalized}}`);
        } catch (err) {}
    }

    if (jsonRequest) request = jsonRequest;
    else if (message.text.trim().split('').filter(c => /[\-0-9]/.test(c)).length == message.text.trim().length) request.ein = message.text.trim().split('-').join('');
    else request.org = message.text.trim();

    if (request.ein) request.ein = request.ein.split('-').join('');

    const url = `https://nonprofit.yodacode.xyz/api?${Object.keys(request).map(key => `${key}=${encodeURIComponent(request[key])}`).join('&')}`;
    const response = await fetch(url);
    const json = await response.json();

    if (!json.length || (json[0] && json[0]["0"] == "There are no data records to display.")) {
        web.reactions.remove({
            channel: message.channel,
            timestamp: message.ts,
            name: loading
        });
        web.reactions.add({
            channel: message.channel,
            timestamp: message.ts,
            name: failed
        });
        await say({ text: "There are no data records to display.", thread_ts: message.ts });
        return;
    }

    web.reactions.remove({
        channel: message.channel,
        timestamp: message.ts,
        name: loading
    });
    web.reactions.add({
        channel: message.channel,
        timestamp: message.ts,
        name: thumbsUp
    });

    let messages = [];
    let results = `(${json.length} results in ${prettyTime(Date.now() - start)})`;

    messages.push({
        blocks: [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": ":cat_typing: Here you go: _" + results + "_"
                }
            }
        ], thread_ts: message.ts
    });

    for (const result of json) {
        if (messages[messages.length - 1].blocks.length >= 48) messages.push({ blocks: [], thread_ts: message.ts });
        messages[messages.length - 1].blocks = [
            ...messages[messages.length - 1].blocks,
            ...(messages[messages.length - 1].blocks.length ? [{
                "type": "divider"
            }] : []),
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": `${result["Organization Name"]} - ${result.Year} (${result.State})`,
                    "emoji": true
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `*EIN:* ${result.EIN}\n*Form:* ${result.Form}\n*Total Assets:* ${result["Total assets"]}`
                }
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "emoji": true,
                            "text": "Open Form ➡️"
        
                        },
                        "value": "click_me",
                        "url": result.Link.startsWith('//') ? `https:${result.Link}` : result.Link
                    }
                ]
            }
        ]
    }

    for (const message of messages) {
        await say(message);
    }
});

(async () => {
    await app.start();
    console.log('⚡️ Bolt app started');
})();
