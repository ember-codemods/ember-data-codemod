//  Test cases:
//  * This comment gets preserved at the top of the file.
//  * Re-uses existing aliases if already specified
//  * Chooses appropriate alias if not specified
//  * Adds default export to named exports if they already exist
//  * Adds named exports to default export if it already exists
//  * Variables named `DS` are not considered
//  * Manual aliasing (`var Adapter = DS.Adapter` is removed)
//  * `DS` must be the root of property lookups (no `foo.DS.bar`)
//  * Renamed destructured aliases are preserved (`attr: thing`)
import Nodel from "@ember-data/model";
import DS from 'ember-data';

let bar = foo.DS.attr;

const Adapter = DS.Adapter;

const {
  attr: thing
} = DS;

export default DS.Model.extend({
  shoe: thing('number'),
  glass: DS.attr('string')
});

(function() {
  let DS = {};
  DS.Model = class Adapter {
  };
})();
