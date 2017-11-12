'use strict';

class TextStream {

  constructor(str) {
    this.str = str;
    this.char = 0;

    this.debugLine = 1;
    this.debugChar = 1;
  }

  peak() {
    return this.str[this.char];
  }

  peakSnip(length) {
    length = length || 10;
    return this.str.slice(this.char, this.char + length);
  }

  end() {
    return this.char >= this.str.length;
  }

  next() {
    if (this.end()) throw new Error('Unexpected end of input');
    this.char++;
    if (this.str[this.char-1] == '\n') {
      this.debugLine++;
      this.debugChar = 1;
    } else this.debugChar++;
    return this.str[this.char-1];
  }

  expect(c, noError) {
    if (this.str[this.char] != c) {
      if (!noError) throw new Error('Expected character '+c+', found: '+this.peakSnip(10)+this.getError());
      else return false;
    }
    return this.next();
  }

  getError() {
    return ' (line '+this.debugLine+' char '+this.debugChar+')';
  }
}

module.exports = TextStream;