import { reverseStates } from './states.js';
import fetch from 'node-fetch';
import fs from 'fs';

const states = Object.keys(reverseStates);
(async () => {
    for (const state of states) {
        const response = await fetch('https://suncatcherstudio.com/uploads/patterns/us-states/map-outlines/svg/' + state.toLowerCase().split(' ').join('-') + '-map-outline-dddddd.png');
        const buffer = await response.buffer();
        fs.writeFileSync('states/us-states-' + reverseStates[state].toLowerCase() + '.png', buffer);
    }
})();

