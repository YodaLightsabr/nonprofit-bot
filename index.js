import { slackDecode } from './decode.js';
import env from './env.js';
import fetch from 'node-fetch';
import { reactions, react, staticReact } from './reactions.js';
import SlackBolt from '@slack/bolt';
import SlackWebAPI from '@slack/web-api';
import JSON5 from 'json5';
import { states } from './states.js';

const { App } = SlackBolt;
const { WebClient } = SlackWebAPI;

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
});

async function fetchBuffer (...args) {
    const res = await fetch(...args);
    const buffer = await res.buffer();
    return buffer;
}

async function fetchJson (...args) {
    const res = await fetch(...args);
    const json = await res.json();
    return json;
}

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

    web.reactions.add({
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

    const promise1 = fetchJson(`https://nonprofit.yodacode.xyz/api?${Object.keys(request).map(key => `${key}=${encodeURIComponent(request[key])}`).join('&')}`);
    let json;

    if (request.org && request.org.toLowerCase().startsWith('the')) {
        request.org = request.org.substring(3).trim();
        const promise2 = fetchJson(`https://nonprofit.yodacode.xyz/api?${Object.keys(request).map(key => `${key}=${encodeURIComponent(request[key])}`).join('&')}`);
        const responses = await Promise.all([promise1, promise2]);
        json = [...responses[0], ...responses[1]];
    } else if (request.org) {
        request.org = 'The ' + request.org;
        const promise2 = fetchJson(`https://nonprofit.yodacode.xyz/api?${Object.keys(request).map(key => `${key}=${encodeURIComponent(request[key])}`).join('&')}`);
        const responses = await Promise.all([promise1, promise2]);
        json = [...responses[0], ...responses[1]];
    } else {
        json = await promise1;
    }

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


    let end = Date.now();

    const orgs = [];

    for (const org of json) {
        if (!org["EIN"].split('').filter(c => /[0-9]/.test(c)).length) continue; 
        if (orgs.map(org => org.ein).includes(org["EIN"])) continue;
        orgs.push({ ein: org.EIN, name: org["Organization Name"], state: org.State });
    }

    let results = `(${orgs.length} results in ${prettyTime(end - start)})`;

    
    const messageData = {
        text: "I've found some results for your query.",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "I've found a few results for your query *" + message.text.trim() + "*: _" + results + "_"
                }
            },
            {
                "type": "divider"
            },
            ...(() => {
                const combined = [];
                const data = (orgs.map(result => ([
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": `${result.name} (${states[result.state] || result.state})`,
                            "emoji": true
                        }
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": `#️⃣ *EIN:* ${result.ein}`
                        },
                        "accessory": {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Select",
                                "emoji": true
                            },
                            "value": result.ein.split('-').join(''),
                            "action_id": "select"
                        }
                    },
                    {
                        "type": "divider"
                    }
                ])));
                data.forEach(a => combined.push(...a));
                return combined;
            })()
        ].filter((_, i) => i < 50),
        thread_ts: message.ts
    };

    await say(messageData);

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

});

app.action('select', async (args) => {
    const { body, ack, say, payload } = args;
    const { thread_ts } = body.message;
    
    const blocks = body.message.blocks;
    const newBlocks = blocks.map(block => {
        if (block.type === "section" && block.accessory && block.accessory.action_id === "select") {
            if (block.accessory.value == payload.value) block.text.text += ' - ✅ Selected';
            delete block.accessory;
        }
        return block;
    });
    
    // Acknowledge the action
    ack();

    web.chat.update({
        channel: 'C03JKV42ZQD',
        ts: body.message.ts,
        blocks: newBlocks
    });

    const ein = payload.value;

    const response = await fetch('https://nonprofit.yodacode.xyz/api?ein=' + ein);
    const json = await response.json();

    let forms = [];


    for (const form of json) {
        if (!forms.map(f => f.link).includes(form.link)) forms.push({
            link: form.Link,
            year: form.Year,
            form: form.Form,
            assets: form["Total assets"],
            name: `${form["Organization Name"]} ${form.Year} ${form.Form} Form.pdf`
        });
    }

    forms = forms.sort((a, b) => (+a.year - +b.year));

    const links = [];

    const files = Promise.all(
        forms.map(form => fetchBuffer(form.link.startsWith('//') ? 'https:' + form.link : form.link))
    );

    let i = 0;

    for (const form of forms) {
        const buffer = files[i];

        // console.log('Downloading file', form.name);
        // const buffer = await fetch(form.link.startsWith('//') ? 'https:' + form.link : form.link).then(res => res.buffer());

        console.log('Downloaded; uploading to Slack');

        const output = await web.files.upload({
            filename: form.name,
            file: buffer,
            thread_ts,
            initial_comment: `${form.year} - File ${i + 1} of ${forms.length}`,
            // title: form.name,
            channels: 'C03JKV42ZQD'
        });

        links.push(output.file.permalink);
        i++;
    }

});

(async () => {
    await app.start();
    console.log('⚡️ Bolt app started');
})();
