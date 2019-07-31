import Model, { hasMany as many, belongsTo, attr } from '@ember-data/model';
import MyStore, { normalizeModelName as normalize } from '@ember-data/store';
import JSONAPIAdapter from '@ember-data/adapter/json-api';
import AdapterError, { InvalidError, ServerError, TimeoutError, NotFoundError } from '@ember-data/adapter/error';
import Transform from '@ember-data/serializer/transform';
