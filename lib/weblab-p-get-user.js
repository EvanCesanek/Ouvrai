#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';

const program = new Command();
program.parse(process.argv);

const res = await axios.get('https://api.prolific.co/api/v1/users/me', {
  headers: {
    Authorization: `Token ${process.env.PROLIFIC_AUTH_TOKEN}`,
  },
});

console.log(`Status Code: ${res.status}`);
console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
console.log(`Data: ${JSON.stringify(res.data, null, 2)}`);
