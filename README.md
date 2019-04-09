# Ember Data Codemod

:warning: this is a POC :warning:

This repository is heavily inspired (if not copied and adapted) by [ember-modules-codemod](https://github.com/ember-cli/ember-modules-codemod). [This PR](https://github.com/dcyriller/ember-data-codemod/pull/1) illustrates the work needed to adapt ember-modules-codemod to fit ember-data needs.

This codemod uses [`jscodeshift`](https://github.com/facebook/jscodeshift) to update an Ember application to import ember-data code using the new module syntax, as proposed in [RFC 395: @ember-data packages](https://github.com/emberjs/rfcs/pull/395). For now, it can update apps that use the global `DS`.

## Usage

```sh
npx github:dcyriller/ember-data-codemod
```
