'use strict';

const Victor = require('victor');

const POLE_REACH = {
  1: 7,
  2: 7,
  3: 7,
  4: 6,
  5: 5,
  6: 3
};

class Builder {

  constructor(blueprint, opt) {
    this.blueprint = blueprint;
    this.direction = opt.direction || new Victor(1, 0);

    this.inColor = opt.inColor || 'green';
    this.outColor = opt.outColor || 'red';

    this.electricOffset = opt.electricOffset || 1;
    this.offset = new Victor(0, 0);
    this.rotation = opt.rotation || 0;

    this.inEntities = opt.inEntities || [];
    this.outEntities = [];

    this.start = opt.start ? opt.start.clone() : this.direction.clone().rotate(Math.PI/2).multiply(new Victor(0, 0));
    this.type = opt.parser.type;
    this.body = opt.parser.body;
    this.not = opt.parser.not;
    this.parser = opt.parser;

    this.entities = [];
    this.poles = [];
  }

  run() {
    console.log(Array(2*(this.electricOffset-1)).join(' ')+this.type+' ('+this.inColor+','+this.outColor+')');
    let last = this.type != 'series' ? null : this.inEntities;
    if (this.type == 'chain') {
      last = [this.blueprint.createEntity('medium_electric_pole', this.start.clone().subtract(this.direction))];
    }

    let exprBuilder = null;
    let exprSize = 0;

    if (this.type == 'if') {
      exprBuilder = new Builder(this.blueprint, this.getOpt(last, this.parser.expr, false));
      this.offset.add(exprBuilder.run().offset);
      this.entities.push(exprBuilder);
    } else if (this.type == 'compare') {
      let left = this.parser.left;
      let right = this.parser.right;
      const connect = this.inEntities;

      for (var i = 0; i < 2; i++) {
        const side = i == 0 ? this.parser.left : this.parser.right;
        if (typeof side != 'object') continue;
        
        const sideBuilder = new Builder(this.blueprint, this.getOpt(null, side, false));
        this.offset.add(sideBuilder.run().offset);
        this.entities.push(sideBuilder);

        connect.push(...sideBuilder.outEntities);

        if (i == 0) left = side.body[side.body.length-1].out;
        else right = side.body[side.body.length-1].out;
      }

      const compare = this.variable({
        operator: this.parser.operator,
        left: left,
        right: right,
        countFromInput: false,
        out: this.parser.out
      }, connect, true);

      if (this.not) {
        this.variable({
          operator: '=',
          left: this.parser.out,
          right: 0,
          countFromInput: false,
          out: this.parser.out
        }, [compare], true);
      }
    }

    const request = this.type == 'if' ? { type: 'request', entities: [] } : null;
    if (request != null) this.inEntities.push(request);

    if (this.body) { // Main body parsing section
      for (let i = 0; i < this.body.length; i++) {
        if (this.body[i].type == 'variable') { // Variable element
          last = [this.variable(this.body[i], this.getMidEntities(last), false)];
        } else { // Builder element
          const builder = new Builder(this.blueprint, this.getOpt(last, this.body[i], this.body[i].type == 'branch'));
          this.offset.add(builder.run().offset);
          this.entities.push(builder);
          last = builder.outEntities;
        }
      }
    }

    this.inEntities.pop(); // Pop `request`

    if (this.type == 'series') {
      for (let i = 0; i < this.entities.length-1; i++) {
        this.connect(this.entities[i], this.entities[i], 'in', 'out');
      }
    } else if (this.type == 'chain') {
      const pole = this.blueprint.createEntity('medium_electric_pole', this.start.clone().add(this.offset));
      this.connectAll(pole, this.getOutEntities(), null, 'out', 'red');
    } else if (this.type == 'if') {
      const exprOut = this.parser.expr.out;
      const subtractAll = this.variable({
        left: 'signal_each',
        operator: '*',
        right: -1,
        out: 'signal_each'
      }, [...this.inEntities], false); // Input to IF
      const testExpr = this.variable({
        left: exprOut,
        operator: '=',
        right: 1,
        countFromInput: true,
        out: exprOut
      }, null, true); // Output from EXPR
      const subtractExpr = this.variable({
        left: exprOut,
        operator: '*',
        right: -1,
        out: exprOut
      }, [testExpr], false); // Output from test of `out`
      const oneWay = this.variable({
        left: 'signal_each',
        operator: '+',
        right: 0,
        out: 'signal_each'
      }, null, false);
      const testAll = this.variable({
        left: exprOut,
        operator: '=',
        right: 1,
        countFromInput: true,
        out: 'signal_everything'
      }, null, true); // Output from difference

      const altColor = !this.parser.isWhile ? 'red' : 'green';

      this.connectAll(subtractAll, last, 'out', 'out', 'red');
      this.connect(subtractExpr, testAll, 'out', 'out', altColor); // Remove `expr` var and add all

      this.connect(subtractAll, testAll, 'out', 'in', 'red');
      this.connect(subtractAll, oneWay, 'in', 'in', 'red');
      if (!this.parser.isWhile) this.connect(oneWay, testAll, 'out', 'out', 'red');

      this.connectAll(testExpr, exprBuilder.outEntities, 'in', 'out', this.outColor); // Get expr output
      this.connect(testExpr, testAll, 'in', 'in', this.outColor);

      if (this.parser.isWhile) {
        this.connectAll(testAll, request.entities, 'out', 'in', altColor);
        this.connectAll(testAll, exprBuilder.outEntities, 'out', 'in', 'red');
      }
    } else if (this.type == 'and' || this.type == 'or') {
      const statement = this.type == 'or' ? 0 : this.body.length;
      const sign = this.type == 'or' ? (!this.not ? '>' : '=') : (!this.not ? '=' : '<');

      const myEntities = this.entities.map(ent => ent.outEntities ? ent.outEntities : ent)
                            .reduce((total, element) => total.concat(element), []);
      
      this.variable({
        operator: sign,
        left: this.parser.out,
        right: statement,
        countFromInput: false,
        out: this.parser.out
      }, myEntities, true);
    }

    this.outEntities = this.getOutEntities();

    return this;
  }

  // Entity outputs
  // e.g. End of one element in a chain (such as parallel) so we know what entities to
  // connect to the next element's input (such as another parallel)
  //
  // In short, use getOutEntities for a sibling element
  getOutEntities() {
    if (!this.entities.length) return [];
    let out = [this.entities[this.entities.length-1]];
    if (this.type == 'parallel') out = this.entities;
    else if (this.parser.isWhile == true) out = [this.entities[this.entities.length-2]];

    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].getOutEntities) {
        out = out.concat(out[i].getOutEntities());
        out.splice(i, 1);
      }
    }
    return out;
  }

  // Entities to connect to something inside of a builder
  // e.g. Series inside of a Parallel (series wouldn't be the only thing inside the parallel)
  // Would getMidEntities of parallel to be inEntities of series
  // Another example: Arithmetic combinator: Needs the series.getMidEntities (which becomes
  // its inEntities)
  //
  // In short, use getMidEntities to get connections to a child
  getMidEntities(last) {
    if (this.type == 'parallel' || 
        this.type == 'or' || 
        this.type == 'and' ||
        this.type == 'if' ||
        this.type == 'compare') return this.inEntities.slice(0);
    else return last.slice(0) || [];
  }

  variable(item, connect, compare) {
    let entity = this.blueprint.createEntity(compare ? 'decider_combinator' : 'arithmetic_combinator', 
                    this.start.clone().add(this.offset))
                    .setCondition(item)
                    .setDirection(this.rotation);
    if (connect) {
      for (let i = 0; i < connect.length; i++) {
        if (connect[i].type == 'request') connect[i].entities.push(entity);
        else this.connect(entity, connect[i], 'in', 'out', connect[i].name == 'medium_electric_pole' ? (connect.outColor || 'red') : 'green');
      }
    }
    this.offset.add(this.direction);
    this.entities.push(entity);
    return entity;
  }


  parallel() {

  }

  connect(ent, toEnt, mySide, theirSide, color) { // TODO: Create poles if can't reach
    const positionDiffernece = toEnt.position.clone().subtract(ent.position);
    if (positionDiffernece.x < 0 || positionDiffernece.y < 0) {
      const tmpEnt = ent;
      ent = toEnt;
      toEnt = tmpEnt;
      const tmpSide = mySide;
      mySide = theirSide
      theirSide = tmpSide;
    }

    let nearestConnection = ent;
    let currPole = 0;
    while (toEnt.position.clone().multiply(this.direction)
              .distance(nearestConnection.position.clone().multiply(this.direction)) 
            > (currPole == 0 ? 7 : POLE_REACH[this.electricOffset]-1)) {
      const maxDist = currPole == 0 ? 0 : Math.min(9, Math.max(Math.abs(nearestConnection.position.x - toEnt.position.x),
                                                                          Math.abs(nearestConnection.position.y - toEnt.position.y)));
      const nextPos = currPole == 0 ? ent.position.clone().add(this.direction.clone().rotate(-Math.PI/2)
                                                  .multiply(new Victor(this.electricOffset+1, this.electricOffset+1)))
                                                  .add(new Victor(0.1, 0.1))
                                                  .unfloat() :
                                      nearestConnection.position.clone()
                                        .add(this.direction.clone().multiply(new Victor(maxDist, maxDist)));       
      if (this.poles[currPole]) nearestConnection = this.poles[currPole];
      else if (this.blueprint.findEntity(nextPos)) nearestConnection = this.blueprint.findEntity(nextPos);
      else {
        const pole = this.blueprint.createEntity('medium_electric_pole', nextPos)
                        .connect(nearestConnection, null, theirSide, color);
        nearestConnection = pole;
        this.poles.push(pole);
      }
      currPole++;
    }
    nearestConnection.connect(toEnt, mySide, theirSide, color);
  }

  connectAll(ent, entList, mySide, theirSides, color) { // TODO: Create poles if can't reach
    for (var i = 0; i < entList.length; i++) {
      this.connect(ent, entList[i], mySide, theirSides, color);
    }
  }

  getOpt(last, parser, changeDir) {
    const noSwitch = this.type == 'compare';
    return {
      direction: changeDir ? this.direction.clone().rotateByDeg(90) : this.direction,
      electricOffset: this.electricOffset + 1,
      inEntities: this.getMidEntities(last),
      start: this.start.clone().add(this.offset),
      parser: parser,
      rotation: changeDir ? (this.rotation == 0 ? 2 : 0) : this.rotation,

      inColor: this.outColor,
      outColor: !noSwitch ? oppositeColor(this.outColor) : this.outColor
    };
  }
}

function oppositeColor(color) {
  return color == 'red' ? 'green' : 'red';
}

module.exports = Builder;