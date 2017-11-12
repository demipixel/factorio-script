'use strict';

const TextStream = require('./textstream');

class SectionStream {

  constructor(str) {
    this.stream = new TextStream(str);
  }

  skipWhitespace(noNewLine) {
    while (this.stream.peak() == ' ' || (!noNewLine && this.stream.peak() == '\n')) {
      this.stream.next();
    }
  }

  nextKeyword(allowNumber) {
    let word = '';
    const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_@';
    this.skipWhitespace();
    while (allowed.indexOf(this.stream.peak()) != -1) {
      word += this.stream.next();
    }
    if (!word.length) throw new Error('Expected keyword'+this.stream.getError());
    let isNumber = !isNaN(parseInt(word));
    if (isNumber && !allowNumber) throw new Error('Variable name can not be only numbers'+this.stream.getError());
    return !isNumber ? word : parseInt(word);
  }

  nextExpression(logic) {
    let expr = '';
    const allowed = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_+-*/()'+(logic?'&|<>=!':'');
    this.skipWhitespace();
    while (!this.stream.end() && allowed.indexOf(this.stream.peak()) != -1) {
      expr += this.stream.next();
    }
    if (!expr.length) throw new Error('Expected expression'+this.stream.getError());
    return expr;
  }

  expectCharacter(char, noError, noWhitespace) {
    if (!noWhitespace) this.skipWhitespace();
    return this.stream.expect(char, noError);
  }

  expectSimpleExpression() {
    this.skipWhitespace();
    return {
      left: this.nextKeyword(true),
      operator: this.expectSet('+-*/'),
      right: this.nextKeyword(true)
    };
  }

  expectSet(chars, noError, noWhitespace) {
    if (!noWhitespace) this.skipWhitespace();
    if (chars.indexOf(this.stream.peak()) != -1) return this.stream.next();
    else if (!noError) throw new Error('Expected one of set '+(typeof chars == 'string' ? 
                                                                chars.split('').join(',') : 
                                                                chars.join(','))
                                                             +' found'+this.stream.peakSnip(10)+this.stream.getError());
    else return false;
  }

  end() {
    return this.stream.end();
  }
}

module.exports = SectionStream;