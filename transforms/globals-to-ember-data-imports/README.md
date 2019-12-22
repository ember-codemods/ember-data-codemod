# globals-to-ember-data-imports

This is a transform to upgrade to the new "@ember-data" packages.

Before version 3.11, you would import ember-data modules from "ember-data".

It will turn the following code:
```
import DS from 'ember-data';

const {
  attr: thing
} = DS;

export default DS.Model.extend({
  shoe: thing('number'),
  glass: DS.attr('string')
});
```
into:
```
import Model, { attr as thing } from '@ember-data/model';

export default Model.extend({
  shoe: thing('number'),
  glass: thing('string')
});
