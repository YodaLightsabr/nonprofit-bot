export const reactions = {
    thumbsUp: [
        'sad-cat-thumbs-up',
        'thumbsup',
        'thumbsup_all',
        'thumbsup-dino',
        'ok'
    ],
    failed: [
        'x',
        'x',
        'x',
        'x',
        'nooo',
        'no',
        'tw_no_entry',
        'tw_no_entry',
        'tw_x',
        'x_1',
        'x_x',
    ],
    loading: [
        'beachball',
    ],
    welcome: [
        'wave',
        'wave-pikachu',
        'doggo_wave',
        'hyper-dino-wave',
        'tw_wave',
        'heydino'
    ]
};

export function react (type) {
    return reactions[type][reactions[type].length * Math.random() | 0];
}

export function staticReact () {
    const object = {};
    for (const reaction in reactions) {
        object[reaction] = react(reaction);
    }
    return object;
}