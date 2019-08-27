import { hasMany as many, belongsTo } from 'ember-data/relationships';
import { normalizeModelName as normalize } from 'ember-data/store';
import JSONAPIAdapter from 'ember-data/adapters/json-api';
import { InvalidError, ServerError, TimeoutError, NotFoundError  } from 'ember-data/adapter/error';
import attr from 'ember-data/attr';
import { AdapterError } from 'ember-data/adapters/errors';
import Model from 'ember-data/model';
import Transform from '@ember-data/serializer/transform';
import MyStore from '@ember-data/store';
