#!/usr/bin/env node
'use strict';

const transforms =
  process.argv[2] === '.' ? 'globals-to-ember-data-imports' : process.argv[2];

require('codemod-cli').runTransform(
  __dirname,
  transforms /* transform name */,
  process.argv.slice(3) /* paths or globs */
);
