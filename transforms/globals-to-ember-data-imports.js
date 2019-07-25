'use strict';

const fs = require('fs');
const MAPPINGS = require('@ember-data/rfc395-data');

const LOG_FILE = 'ember-data-codemod.tmp.' + process.pid;
const ERROR_WARNING = 1;
const MISSING_GLOBAL_WARNING = 2;

const OPTS = {
  quote: 'single'
};

module.exports = transform;

/**
 * This is the entry point for this jscodeshift transform.
 * It scans JavaScript files that use the DS global and / or the old imports.
 * It updates them to use the module syntax from the proposed new RFC.
 */
function transform(file, api /*, options*/) {
  let source = file.source;
  let j = api.jscodeshift;

  let root = j(source);

  // Track any use of `DS.*` that isn't accounted for in the mapping. We'll
  // use this at the end to generate a report.
  let warnings = [];

  let pendingGlobals = {};

  try {
    // Discover existing module imports, if any, in the file. If the user has
    // already imported one or more exports that we rewrite a global with, we
    // won't import them again. We also try to be smart about not adding multiple
    // import statements to import from the same module, condensing default
    // exports and named exports into one line if necessary.
    let modules = findExistingModules(root);

    // Build a data structure that tells us how to map properties on the DS
    // global into the module syntax.
    let mappings = buildMappings(modules);

    let globalDS = getGlobalDSName(root);

    // Discover global aliases for DS keys that are introduced via destructuring,
    // e.g. `const { Model } = DS;`.
    let globalAliases = findGlobalDSAliases(root, globalDS, mappings);

    // Go through all of the tracked pending DS globals. The ones that have
    // been marked as missing should be added to the warnings.
    resolvePendingGlobals();

    // Resolve the discovered aliases against the module registry. We intentionally do
    // this ahead of finding replacements for e.g. `DS.Model` usage in
    // order to reuse custom names for any fields referenced both ways.
    resolveAliasImports(globalAliases, mappings, modules);

    // Scan the source code, looking for any instances of the `DS` identifier
    // used as the root of a property lookup. If they match one of the provided
    // mappings, save it off for replacement later.
    let replacements = findUsageOfDSGlobal(root, globalDS).map(
      findReplacement(mappings)
    );

    // Now that we've identified all of the replacements that we need to do, we'll
    // make sure to either add new `import` declarations, or update existing ones
    // to add new named exports or the default export.
    updateOrCreateImportDeclarations(root, modules, mappings);

    // Actually go through and replace each usage of `DS.whatever` with the
    // imported binding (`whatever`).
    applyReplacements(replacements);

    // Finally remove global DS import if no globals left
    removeGlobalDS(root, globalDS);

    // jscodeshift is not so great about giving us control over the resulting whitespace.
    // We'll use a regular expression to try to improve the situation (courtesy of @rwjblue).
    const lineTerminator = source.indexOf('\r\n') > -1 ? '\r\n' : '\n';

    source = root.toSource(Object.assign({}, OPTS, { lineTerminator }));
  } catch (e) {
    if (process.env.EMBER_DATA_CODEMOD) {
      warnings.push([ERROR_WARNING, file.path, source, e.stack]);
    }

    throw e;
  } finally {
    // If there were modules that we didn't know about, write them to a log file.
    // We only do this if invoked via the CLI tool, not jscodeshift directly,
    // because jscodeshift doesn't give us a cleanup hook when everything is done
    // to parse these files. (This is what the environment variable is checking.)
    if (warnings.length && process.env.EMBER_DATA_CODEMOD) {
      warnings.forEach(warning => {
        fs.appendFileSync(LOG_FILE, JSON.stringify(warning) + '\n');
      });
    }
  }

  return source;

  /**
   * Loops through the raw JSON data in `mapping.json` and converts each entry
   * into a Mapping instance. The Mapping class lazily reifies its associated
   * module as they it is consumed.
   */
  function buildMappings(registry) {
    let mappings = {};

    for (let mapping of MAPPINGS) {
      mappings[mapping.global.substr('DS.'.length)] = new Mapping(
        mapping,
        registry
      );
    }

    return mappings;
  }

  function getGlobalDSImport(root) {
    return root.find(j.ImportDeclaration, {
      specifiers: [
        {
          type: 'ImportDefaultSpecifier'
        }
      ],
      source: {
        value: 'ember-data'
      }
    });
  }

  function getGlobalDSName(root) {
    const globalDS = getGlobalDSImport(root);

    let defaultImport = globalDS.find(j.Identifier);
    let defaultMemberName =
      defaultImport.size() && defaultImport.get(0).node.name;

    return defaultMemberName || 'DS';
  }

  /*
   * Finds all uses of a property looked up on the DS global (i.e.,
   * `DS.something`). Makes sure that it is actually the DS global
   * and not another variable that happens to be called `DS`.
   */
  function findUsageOfDSGlobal(root, globalDS) {
    let dsUsages = root.find(j.MemberExpression, {
      object: {
        name: globalDS
      }
    });

    return dsUsages.filter(isDSGlobal(globalDS)).paths();
  }

  /*
   * loops through all modules and replaces literal path if necessary
   * 'ember-data/model' -> '@ember-data/model'
   */
  function updateExistingLiteralPaths(root, module, mappings) {
    let foundMapping = mappings[module.local];

    if (foundMapping) {
      let newSource = foundMapping.source;
      if (module.source !== newSource) {
        root
          .find(j.ImportDeclaration, {
            source: {
              type: 'Literal',
              value: module.source
            }
          })
          .find(j.Literal)
          .forEach(importLiteral => {
            j(importLiteral).replaceWith(j.literal(newSource));
          });
      }
    }
  }

  /*
   * After modifying existing sources to their new paths, we need
   * to make sure we clean up duplicate imports
   */
  function cleanupDuplicateLiteralPaths() {
    const imports = {};
    root.find(j.ImportDeclaration).forEach(nodePath => {
      let value = nodePath.value && nodePath.value.source.value;

      if (!(value in imports)) {
        // add to found imports and we wont modify
        imports[value] = nodePath;
      } else {
        // get all specifiers and add to existing import
        // then delete this nodePath
        let specifiers = nodePath.value && nodePath.value.specifiers;
        let existingNodePath = imports[value];

        specifiers.forEach(spec => {
          let local = spec.local;
          let imported = spec.imported;

          if (imported === 'default') {
            let specifier = j.importDefaultSpecifier(j.identifier(local));
            // default imports go at front
            existingNodePath.get('specifiers').unshift(specifier);
          } else if (imported && local) {
            let specifier = j.importSpecifier(
              j.identifier(imported.name),
              j.identifier(local.name)
            );
            existingNodePath.get('specifiers').push(specifier);
          } else {
            let specifier = j.importSpecifier(j.identifier(local.name));
            existingNodePath.get('specifiers').push(specifier);
          }
        });

        nodePath.prune();
      }
    });
  }

  // Find destructured global aliases for fields on the DS global
  function findGlobalDSAliases(root, globalDS, mappings) {
    let aliases = {};
    let assignments = findUsageOfDestructuredDS(root, globalDS);
    for (let assignment of assignments) {
      let dsPath = joinDSPath(assignment.get('init'), globalDS);
      for (let alias of extractAliases(
        mappings,
        assignment.get('id'),
        dsPath
      )) {
        aliases[alias.identifier.node.name] = alias;
      }
    }
    return aliases;
  }

  function findUsageOfDestructuredDS(root, globalDS) {
    // Keep track of the nested properties off of the DS namespace,
    // const { Model } = DS;
    let globalDSWithNestedProperties = [globalDS];
    let uses = root.find(j.VariableDeclarator, node => {
      if (j.Identifier.check(node.init)) {
        if (includes(globalDSWithNestedProperties, node.init.name)) {
          // We've found a DS global, or one of its nested properties.
          // Add it to the uses, and add its properties to the list of nested properties
          const identifierProperties = getIdentifierProperties(node);
          globalDSWithNestedProperties = globalDSWithNestedProperties.concat(
            identifierProperties
          );
          return true;
        }
      } else if (j.MemberExpression.check(node.init)) {
        return node.init.object.name === globalDS;
      }
    });

    return uses.paths();
  }

  function resolvePendingGlobals() {
    Object.keys(pendingGlobals).forEach(key => {
      let pendingGlobal = pendingGlobals[key];
      const parentPath = pendingGlobal.pattern.parentPath;
      if (!pendingGlobal.hasMissingGlobal) {
        parentPath.prune();
      } else {
        warnMissingGlobal(parentPath, pendingGlobal.dsPath);
      }
    });
  }

  function getIdentifierProperties(node) {
    let identifierProperties = [];
    node.id.properties.forEach(property => {
      if (j.Identifier.check(property.value)) {
        identifierProperties.push(property.key.name);
      }
    });

    return identifierProperties;
  }

  function joinDSPath(nodePath, globalDS) {
    if (j.Identifier.check(nodePath.node)) {
      if (nodePath.node.name !== globalDS) {
        return nodePath.node.name;
      }
    } else if (j.MemberExpression.check(nodePath.node)) {
      let lhs = nodePath.node.object.name;
      let rhs = joinDSPath(nodePath.get('property'));
      if (lhs === globalDS) {
        return rhs;
      } else {
        return `${lhs}.${rhs}`;
      }
    }
  }

  // Determine aliases introduced by the given destructuring pattern, removing
  // items from the pattern when they're available via a module import instead.
  // Also tracks and flags pending globals for future patterns,
  // in case we have multi-statement destructuring, i.e:
  // const { computed } = Ember;
  // const { oneWay } = computed;
  function extractAliases(mappings, pattern, dsPath) {
    if (j.Identifier.check(pattern.node)) {
      if (dsPath in mappings) {
        pattern.parentPath.prune();
        const pendingGlobalParent = findPendingGlobal(dsPath);
        if (pendingGlobalParent) {
          // A parent has been found. Mark it as no longer being missing.
          pendingGlobalParent.hasMissingGlobal = false;
        }

        return [new GlobalAlias(pattern, dsPath)];
      } else {
        let thisPatternHasMissingGlobal = false;
        const pendingGlobalParent = findPendingGlobal(dsPath);
        if (pendingGlobalParent) {
          // A parent has been found.  Mark it as a missing global.
          pendingGlobalParent.hasMissingGlobal = true;
        } else {
          // Otherwise, mark this pattern as a missing global.
          thisPatternHasMissingGlobal = true;
        }

        // Add this pattern to pendingGlobals
        pendingGlobals[pattern.node.name] = {
          pattern,
          dsPath,
          hasMissingGlobal: thisPatternHasMissingGlobal
        };
      }
    } else if (j.ObjectPattern.check(pattern.node)) {
      let aliases = findObjectPatternAliases(mappings, pattern, dsPath);
      if (!pattern.node.properties.length) {
        pattern.parentPath.prune();
      }
      return aliases;
    }

    return [];
  }

  function findPendingGlobal(dsPath) {
    if (!dsPath) {
      return;
    }
    const paths = dsPath.split('.');
    for (let idx = 0; idx < paths.length; idx++) {
      const path = paths[idx];
      if (pendingGlobals[path]) {
        return pendingGlobals[path];
      }
    }
  }

  function findObjectPatternAliases(mappings, objectPattern, basePath) {
    let aliases = [];
    for (let i = objectPattern.node.properties.length - 1; i >= 0; i--) {
      let property = objectPattern.get('properties', i);
      let propertyName = property.node.key.name;
      let fullPath = basePath ? `${basePath}.${propertyName}` : propertyName;
      aliases = aliases.concat(
        extractAliases(mappings, property.get('value'), fullPath)
      );
    }
    return aliases;
  }

  function resolveAliasImports(aliases, mappings, registry) {
    for (let globalName of Object.keys(aliases)) {
      let alias = aliases[globalName];
      let mapping = mappings[alias.dsPath];
      registry.get(
        mapping.source,
        mapping.imported,
        alias.identifier.node.name
      );
    }
  }

  /**
   * Returns a function that can be used to map an array of MemberExpression
   * nodes into Replacement instances. Does the actual work of verifying if the
   * `DS` identifier used in the MemberExpression is actually replaceable.
   */
  function findReplacement(mappings, namespace) {
    return function(path) {
      // Expand the full set of property lookups. For example, we don't want
      // just "Ember.computed"—we want "Ember.computed.or" as well.
      let candidates = expandMemberExpressions(path);
      if (namespace) {
        candidates = candidates.map(expression => {
          let path = expression[0];
          let propertyPath = expression[1];
          return [path, `${namespace}.${propertyPath}`];
        });
      }

      // This will give us an array of tuples ([pathString, node]) that represent
      // the possible replacements, from most-specific to least-specific. For example:
      //
      //   [Ember.computed.reads, Ember.computed], or
      //   [Ember.Object.extend, Ember.Object]
      //
      // We'll go through these to find the most specific candidate that matches
      // our global->ES6 map.
      let found = candidates.find(expression => {
        let propertyPath = expression[1];
        return propertyPath in mappings;
      });

      // If we got this far but didn't find a viable candidate, that means the user is
      // using something on the `Ember` global that we don't have a module equivalent for.
      if (!found) {
        warnMissingGlobal(path, candidates[candidates.length - 1][1]);
        return null;
      }

      let nodePath = found[0];
      let propertyPath = found[1];
      let mapping = mappings[propertyPath];

      let mod = mapping.getModule();
      let local = mod.local;
      if (!local) {
        // Ember.computed.or => or
        local = propertyPath.split('.').slice(-1)[0];
      }

      mod.local = local;

      return new Replacement(nodePath, mod);
    };
  }

  function warnMissingGlobal(nodePath, dsPath) {
    let context = extractSourceContext(nodePath);
    let lineNumber = nodePath.value.loc.start.line;
    warnings.push([
      MISSING_GLOBAL_WARNING,
      dsPath,
      lineNumber,
      file.path,
      context
    ]);
  }

  function extractSourceContext(path) {
    let start = path.node.loc.start.line;
    let end = path.node.loc.end.line;

    let lines = source.split('\n');

    start = Math.max(start - 2, 1) - 1;
    end = Math.min(end + 2, lines.length);

    return lines.slice(start, end).join('\n');
  }

  function applyReplacements(replacements) {
    replacements
      .filter(r => !!r)
      .forEach(replacement => {
        let local = replacement.mod.local;
        let nodePath = replacement.nodePath;

        if (isAliasVariableDeclarator(nodePath, local)) {
          nodePath.parent.prune();
        } else {
          nodePath.replace(j.identifier(local));
        }
      });
  }

  function removeGlobalDS(root, globalDS) {
    let remainingGlobals = findUsageOfDSGlobal(root, globalDS);
    let remainingDestructuring = findUsageOfDestructuredDS(root, globalDS);

    if (!remainingGlobals.length && !remainingDestructuring.length) {
      getGlobalDSImport(root).remove();
    }
  }

  function isAliasVariableDeclarator(nodePath, local) {
    let parent = nodePath.parent;

    if (!parent) {
      return false;
    }
    if (!j.VariableDeclarator.check(parent.node)) {
      return false;
    }

    return parent.node.id.name === local;
  }

  function updateOrCreateImportDeclarations(root, registry, mappings) {
    let body = root.get().value.program.body;

    registry.modules.forEach(mod => {
      if (!mod.node) {
        let source = mod.source;
        let imported = mod.imported;
        let local = mod.local;

        let declaration = root.find(j.ImportDeclaration, {
          source: { value: mod.source }
        });
        if (declaration.size() > 0) {
          let specifier;

          if (imported === 'default') {
            specifier = j.importDefaultSpecifier(j.identifier(local));
            // default imports go at front
            declaration.get('specifiers').unshift(specifier);
          } else {
            specifier = j.importSpecifier(
              j.identifier(imported),
              j.identifier(local)
            );
            declaration.get('specifiers').push(specifier);
          }

          mod.node = declaration.at(0);
        } else {
          let importStatement = createImportStatement(source, imported, local);
          body.unshift(importStatement);
          body[0].comments = body[1].comments;
          delete body[1].comments;
          mod.node = importStatement;
        }
      }

      // Update literal paths based on mappings from 'ember-data/model' to '@ember-data/model'
      // by pushing into existing declaration specifiers
      updateExistingLiteralPaths(root, mod, mappings);
    });

    // // then remove old duplicate specifier if found
    cleanupDuplicateLiteralPaths();
  }

  function findExistingModules(root) {
    let registry = new ModuleRegistry();

    root.find(j.ImportDeclaration).forEach(mod => {
      let node = mod.node;
      let source = node.source.value;

      node.specifiers.forEach(spec => {
        let isDefault = j.ImportDefaultSpecifier.check(spec);

        // Some cases like `import * as bar from "foo"` have neither a
        // default nor a named export, which we don't currently handle.
        let imported = isDefault
          ? 'default'
          : spec.imported
          ? spec.imported.name
          : null;

        if (!imported) {
          return;
        }

        if (!registry.find(source, imported)) {
          let mod = registry.create(source, imported, spec.local.name);
          mod.node = node;
        }
      });
    });

    return registry;
  }

  function expandMemberExpressions(path) {
    let propName = path.node.property.name;
    let expressions = [[path, propName]];

    let currentPath = path;

    while ((currentPath = currentPath.parent)) {
      if (j.MemberExpression.check(currentPath.node)) {
        propName = propName + '.' + currentPath.value.property.name;
        expressions.push([currentPath, propName]);
      } else {
        break;
      }
    }

    return expressions.reverse();
  }

  // Flagrantly stolen from https://github.com/5to6/5to6-codemod/blob/master/utils/main.js
  function createImportStatement(source, imported, local) {
    let declaration, variable, idIdentifier, nameIdentifier;
    // console.log('variableName', variableName);
    // console.log('moduleName', moduleName);

    // if no variable name, return `import 'jquery'`
    if (!local) {
      declaration = j.importDeclaration([], j.literal(source));
      return declaration;
    }

    // multiple variable names indicates a destructured import
    if (Array.isArray(local)) {
      let variableIds = local.map(function(v) {
        return j.importSpecifier(j.identifier(v), j.identifier(v));
      });

      declaration = j.importDeclaration(variableIds, j.literal(source));
    } else {
      // else returns `import $ from 'jquery'`
      nameIdentifier = j.identifier(local); //import var name
      variable = j.importDefaultSpecifier(nameIdentifier);

      // if propName, use destructuring `import {pluck} from 'underscore'`
      if (imported && imported !== 'default') {
        idIdentifier = j.identifier(imported);
        variable = j.importSpecifier(idIdentifier, nameIdentifier); // if both are same, one is dropped...
      }

      declaration = j.importDeclaration([variable], j.literal(source));
    }

    return declaration;
  }

  function isDSGlobal(name) {
    return function(path) {
      let localDS = !path.scope.isGlobal && path.scope.declares(name);
      return !localDS;
    };
  }
}

function includes(array, value) {
  return array.indexOf(value) > -1;
}

class ModuleRegistry {
  constructor() {
    this.bySource = {};
    this.modules = [];
  }

  find(source, imported) {
    let byImported = this.bySource[source];

    if (!byImported) {
      byImported = this.bySource[source] = {};
    }

    return byImported[imported] || null;
  }

  create(source, imported, local) {
    if (this.find(source, imported)) {
      throw new Error(`Module { ${source}, ${imported} } already exists.`);
    }

    let byImported = this.bySource[source];
    if (!byImported) {
      byImported = this.bySource[source] = {};
    }

    let mod = new Module(source, imported, local);
    byImported[imported] = mod;
    this.modules.push(mod);

    return mod;
  }

  get(source, imported, local) {
    let mod = this.find(source, imported, local);
    if (!mod) {
      mod = this.create(source, imported, local);
    }

    return mod;
  }
}

class Module {
  constructor(source, imported, local) {
    this.source = source;
    this.imported = imported;
    this.local = local;
    this.node = null;
  }
}

class GlobalAlias {
  constructor(identifier, dsPath) {
    this.identifier = identifier;
    this.dsPath = dsPath;
  }
}

class Replacement {
  constructor(nodePath, mod) {
    this.nodePath = nodePath;
    this.mod = mod;
  }
}

class Mapping {
  constructor(options, registry) {
    this.source = options.replacement.module;
    this.imported = options.replacement.export;
    this.local = options.localName;
    this.registry = registry;
  }

  getModule() {
    return this.registry.get(this.source, this.imported, this.local);
  }
}
