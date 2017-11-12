'use strict';

const SectionStream = require('./sectionstream');
const jsep = require('jsep');
const allVars = require('./vars');

module.exports = parse;

function parse(str) {
  const stream = new SectionStream(str);
  const stack = [{
    type: 'script',
    alias: {
      '@': 'signal_each'
    },
    reserved: [],
    body: []
  }];
  while (!stream.end()) {
    const lastStack = stack[stack.length-1];
    stream.expectCharacter(';', true) // Skip semicolon if exists
    const end = stream.expectCharacter('}', true);
    if (end) {
      if (stack.length == 1) throw new Error('Unexpected } because stack is too small',stream.stream.getError());
      else stack.splice(-1);
      continue;
    }
    const keyword = stream.nextKeyword();
    if (keyword == 'chain') stack.push(chain(lastStack, stream));
    else if (keyword == 'parallel') stack.push(parallel(lastStack, stream));
    else if (keyword == 'series') stack.push(series(lastStack, stream));
    else if (keyword == 'alias') alias(lastStack, stream);
    else if (keyword == 'if') stack.push(ifStatement(lastStack, stream, false));
    else if (keyword == 'while') stack.push(ifStatement(lastStack, stream, true));
    else variable(lastStack.alias[keyword] || keyword, lastStack, stream);
  }
  return stack[0];
}

function variable(name, parent, stream) {
  if (parent.type != 'parallel' && parent.type != 'series') {
    const extra = stream.expectSet('+-*/', true);
    stream.expectCharacter('=');
    let expr = stream.nextExpression();
    if (extra) expr = name + extra + '('+expr+')';
    parent.body.push(generateVariableDeclaration(name, extra, jsep(expr), parent, stream));
  } else {
    const extra = stream.expectSet('+-*/', true);
    stream.expectCharacter('=');
    let obj = { type: 'variable' };
    if (extra) {
      obj.left = name;
      obj.operator = extra;
      obj.right = stream.nextKeyword(true);
    } else {
      let tempObj = stream.expectSimpleExpression();
      obj.left = tempObj.left;
      obj.operator = tempObj.operator;
      obj.right = tempObj.right;
    }
    obj.out = name;
    parent.body.push(obj);
  }
}

function generateVariableDeclaration(name, extra, expr, parent, stream) {
  const obj = {
    type: 'parallel',
    alias: cloneAlias(parent),
    reserved: cloneAlias(parent),
    body: []
  };
  obj.body.push({
    type: 'variable',
    left: 'signal_each',
    operator: '+',
    right: 0,
    out: 'signal_each'
  });
  obj.body.push(seriesObj(parent));
  const series = obj.body[1];
  simplifyExpression(series, expr);
  const list = loopExpression(series, expr, name);
  if (list.length == 0 && list[0].operator == '*' && list[0].left.type == 'Literal') {
    list[0].left.value -= 1;
  } else {
    obj.body.push({
      type: 'variable',
      left: name,
      operator: '*',
      right: -1,
      out: name
    });
  }
  series.body.push(...list);
  return obj;
}

function simplifyExpression(parent, expr, bool) {
  if (!expr || expr.type == 'Identifier') {
    if (expr && parent.alias[expr.name]) expr.name = parent.alias[expr.name];
    return null;
  }
  else if (expr.type == 'Literal') return expr.value;

  const indexOfAvailable = ['+', '-', '*', '/', '<', '>', '=', '!=', '>=', '<=', '||', '&&'].indexOf(expr.operator);
  const thisType = indexOfAvailable >= 10 ? 2 : (indexOfAvailable >= 4 ? 1 : 0);

  bool = bool || 0;
  /*if (bool > thisType) {
    throw new Error('Unexpected operator '+expr.operator);
  }*/

  const nextType = thisType == 1 ? 0 : thisType;
  const left = simplifyExpression(parent, expr.left, nextType);
  const right = simplifyExpression(parent, expr.right, nextType);
  simplifyExpression(parent, expr.argument, nextType);

  if (left != null && right != null) {
    expr.type = 'Literal';
    
    delete expr.left;
    delete expr.right;

    if (expr.operator == '+') expr.value = left + right;
    else if (expr.operator == '-') expr.value = left - right;
    else if (expr.operator == '*') expr.value = left * right;
    else if (expr.operator == '/') expr.value = left / right;
    else if (bool && expr.operator == '<') expr.value = left < right;
    else if (bool && expr.operator == '>') expr.value = left > right;
    else if (bool && expr.operator == '=') expr.value = left == right;
    else if (bool == 2 && expr.operator == '||') expr.value = left || right;
    else if (bool == 2 && expr.operator == '&&') expr.value = left && right;

    delete expr.operator;
    return expr.value;
  } else if ((left != null || right != null) && thisType == 2) {
    const valid = left !== null ? left : right;
    const invalid = left == null ? expr.left : expr.right;

    if ((expr.operator == '&&' && valid === true) || (expr.operator == '||' && valid === false)) {
      expr.type = invalid.type;
      expr.left = invalid.left;
      expr.right = invalid.right;
      expr.operator = invalid.operator;
      expr.name = invalid.name;
    } else {
      expr.type = 'Literal';
      expr.value = valid;
      delete expr.left;
      delete expr.right;
      delete expr.operator;
    }
  } else if (expr.operator == '!') {
    expr.type = expr.argument.type;
    expr.operator = expr.argument.operator;
    expr.left = expr.argument.left;
    expr.right = expr.argument.right;
    expr.not = true;
    delete expr.argument;
  } else if (expr.operator == '!=' || expr.operator == '<=' || expr.operator == '>=') {
    expr.not = true;
    expr.operator = ({
      '!=': '=',
      '<=': '>',
      '>=': '<'
    })[expr.operator];
  } else {
    return null;
  }
}

function loopExpression(parent, expr, put) {
  if (!expr || expr.type == 'Identifier' || expr.type == 'Literal') return [];
  const left = expr.left.type == 'BinaryExpression' ? getTemp(parent) : (expr.left.type == 'Literal' ? expr.left.value : expr.left.name);
  const right = expr.right.type == 'BinaryExpression' ? getTemp(parent) : (expr.right.type == 'Literal' ? expr.right.value : expr.right.name);
  if (expr.left.type == 'BinaryExpression') {
    parent.reserved.push(left);
  }
  if (expr.right.type == 'BinaryExpression') {
    parent.reserved.push(right);
  }
  let out = {
    type: 'variable',
    left: left,
    right: right,
    operator: expr.operator,
    out: put
  };
  return loopExpression(parent, expr.left, left).concat(loopExpression(parent, expr.right, right)).concat(out);
}

function loopBoolExpression(parent, expr, put, parentOperator) {
  if (expr.operator == '||' || expr.operator == '&&') {
    const left = loopBoolExpression(parent, expr.left, put, expr.operator);
    const right = loopBoolExpression(parent, expr.right, put, expr.operator);
    if (expr.operator == parentOperator) return left.concat(right);
    else return [{
        type: expr.operator == '||' ? 'or' : 'and',
        body: left.concat(right),
        not: expr.not,
        out: put
    }];
  } else if (expr.operator == '=' || expr.operator == '<' || expr.operator == '>') {
    return [{
      type: 'compare',
      alias: cloneAlias(parent),
      reserved: parent.reserved.slice(0),
      operator: expr.operator,
      not: expr.not,
      left: loopBoolExpression(parent, expr.left, put),
      right: loopBoolExpression(parent, expr.right, put),
      out: put
    }];
  } else if (expr.type == 'BinaryExpression') {
    return {
      type: 'series',
      body: loopExpression(parent, expr, getTemp(parent))
    }
  } else {
    return expr.type == 'Identifier' ? expr.name : expr.value;
  }
}

function getTemp(item) {
  let temp = '';
  let i = 0;
  do {
    if (i >= allVars.length) throw new Error('No temp variables left!');
    temp = allVars[i];
    i++;
  } while (item.alias[temp] || item.reserved.indexOf(temp) != -1);
  item.reserved.push(temp);
  return temp;
}

function chain(parent, stream) {
  if (parent.type != 'script') throw new Error('Cannot create chain inside of '+parent.type);
  stream.expectCharacter('{');
  parent.body.push({
    type: 'chain',
    alias: cloneAlias(parent),
    reserved: parent.reserved.slice(0),
    body: []
  });
  return parent.body[parent.body.length-1];
}

function parallel(parent, stream) {
  if (parent.type != 'chain' && parent.type != 'branch') throw new Error('Can only create parallel inside chain or branch');
  stream.expectCharacter('{');
  parent.body.push({
    type: 'parallel',
    alias: cloneAlias(parent),
    reserved: parent.reserved.slice(0),
    body: []
  });
  return parent.body[parent.body.length-1];
}

function series(parent, stream) {
  if (parent.type != 'parallel') throw new Error('Can only create series inside parallel');
  stream.expectCharacter('{');
  parent.body.push(seriesObj());
  return parent.body[parent.body.length-1];
}

function seriesObj(parent, body) {
  return {
    type: 'series',
    alias: cloneAlias(parent),
    reserved: parent.reserved.slice(0),
    body: body || []
  };
}

function cloneAlias(parent) {
  const out = {};
  const keys = Object.keys(parent.alias);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = parent.alias[keys[i]];
  }
  return out;
}

function alias(parent, stream) {
  let word = stream.nextKeyword();
  stream.expectCharacter('=');
  let answer = stream.nextKeyword();
  parent.alias[word] = answer;
}

function ifStatement(parent, stream, isWhile) {
  const ifElement = {
    type: 'if',
    isWhile: isWhile,
    alias: cloneAlias(parent),
    reserved: parent.reserved.slice(0),
    body: []
  };
  const expr = jsep(stream.nextExpression(true));
  simplifyExpression(ifElement, expr, 2);
  ifElement.expr = loopBoolExpression(ifElement, expr, getTemp(ifElement))[0];
  stream.expectCharacter('{');
  parent.body.push(ifElement);
  return ifElement;
}