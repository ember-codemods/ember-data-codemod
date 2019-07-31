import Model, { attr, hasMany as many, belongsTo } from '@ember-data/model';
import { normalizeModelName as normalize } from '@ember-data/store';
import JSONAPIAdapter from '@ember-data/adapter/json-api';
import { InvalidError, ServerError, TimeoutError, NotFoundError  } from '@ember-data/adapter/error';
import Transform from '@ember-data/serializer/transform';
