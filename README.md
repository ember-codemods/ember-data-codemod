# Ember Data Codemod

This is a codemod to upgrade to the new "@ember-data" packages.

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
import Model, { attr as thing } from "@ember-data/model";

export default Model.extend({
  shoe: thing('number'),
  glass: thing('string')
});
```

## Usage

The package is not released yet. For now, you can run it this way: 
```sh
npx github:dcyriller/ember-data-codemod
```

## Credits

This repository is a fork of [ember-modules-codemod](https://github.com/ember-cli/ember-modules-codemod) adapted for the needs of ember-data. [This PR](https://github.com/dcyriller/ember-data-codemod/pull/1) illustrates the work needed to adapt ember-modules-codemod to fit ember-data needs.

This codemod uses [`jscodeshift`](https://github.com/facebook/jscodeshift)

## Links

[RFC 395: @ember-data packages](https://github.com/emberjs/rfcs/pull/395).
