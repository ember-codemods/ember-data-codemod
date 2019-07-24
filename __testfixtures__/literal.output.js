import Model, { attr } from '@ember-data/model';
import { hasMany, belongsTo } from '@ember-data/model';
import JSONAPIAdapter from '@ember-data/adapter/json-api';
import { InvalidError, ServerError, TimeoutError, NotFoundError  } from '@ember-data/adapter/error';
import Transform from '@ember-data/serializer/transform';
