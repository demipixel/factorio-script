'use strict';

const Blueprint = require('../factorio-blueprint');
const Builder = require('./builder');
const parser = require('./parser');
const program = require('commander');
const fs = require('fs');

program
  .version('1.0.0')
  .option('-s, --script <file>', 'Script file')
  .option('-d, --debug', 'Debug log')
  .parse(process.argv);

function run(parse, opt) {
  const blueprint = new Blueprint();
  for (let i = 0; i < parse.body.length; i++) {
    const chain = new Builder(blueprint, { parser: parse.body[i] });
    chain.run();
  }
  return blueprint;
}

fs.readFile(program.script || console.log('Missing --script'), (err, data) => {
  if (err) console.log('[ERROR]',err);
  else {
    const parsed = parser(data.toString('utf8'));
    if (program.debug) console.log(JSON.stringify(parsed));
    const bp = run(parsed);
    bp.center();
    if (program.debug) {
      console.log('');
      console.log('Entities:');
      console.log('');
      console.log(bp.toString());
      console.log('');
      console.log('BP String:');
      console.log('');
    }
    console.log(bp.encode());
  }
});