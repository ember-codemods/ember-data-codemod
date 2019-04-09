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
import Nodel, { attr as thing } from "@ember-data/model";

let bar = foo.DS.attr;

export default Nodel.extend({
  shoe: thing('number')
});

(function() {
  let DS = {};
  DS.Model = class Adapter {
  };
})();
