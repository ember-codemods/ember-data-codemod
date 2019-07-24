import Model, { attrs } from 'ember-data/model';
import { hasMany, belongsTo } from 'ember-data/relationships';
import JSONAPIAdapter from 'ember-data/adapters/json-api';
import { InvalidError, ServerError, TimeoutError, NotFoundError  } from 'ember-data/adapter/error';
