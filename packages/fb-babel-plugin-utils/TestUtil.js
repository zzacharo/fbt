/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

/*global expect, it, describe*/

const babel = require('@babel/core');
const generate = require('@babel/generator').default;
const babelParser = require('@babel/parser');
const assert = require('assert');

const IGNORE_KEYS = [
  '__clone',
  'start',
  'end',
  'raw',
  'rawValue',
  'loc',
  'tokens',
  'parenthesized',
  'parenStart',
];

function stripMeta(node, options) {
  let ignoreKeys;
  if (options && options.comments) {
    // keep comments
    ignoreKeys = [...IGNORE_KEYS];
  } else {
    ignoreKeys = [...IGNORE_KEYS, 'leadingComments', 'trailingComments'];
  }
  ignoreKeys.forEach(key => delete node[key]);
  for (const p in node) {
    if (node[p] && typeof node[p] === 'object') {
      stripMeta(node[p], options);
    }
  }
  return node;
}

function getDefaultTransformForPlugins(plugins) {
  return function transform(source) {
    return babel.transformSync(source, {
      plugins,
    }).code;
  };
}

function parse(code) {
  return babelParser.parse(code, {
    sourceType: 'module',
    plugins: ['flow', 'jsx'],
  });
}

function prettyPrint(input) {
  return generate(parse(input), {comments: true}, input).code.trim();
}

function firstCommonSubstring(left, right) {
  let i = 0;
  for (i = 0; i < left.length && i < right.length; i++) {
    if (left.charAt(i) !== right.charAt(i)) {
      break;
    }
  }
  return left.substr(0, i);
}

// New versions of Babel detect and store the trailing comma of function arguments
// in the Babel node structure. But many of our unit tests assume that
// the function trailing comma is not important.
// So let's remove these to facilitate AST comparisons
// We'll also need to use the same type of quotes for strings.
function normalizeSourceCode(sourceCode /*: string */) /*: string */ {
  const ast = parse(sourceCode);
  // Note: @babel/generator does not generate trailing commas by default
  return generate(
    ast,
    {
      comments: true,
      quotes: 'single',
    },
    sourceCode,
  ).code.trim();
}

module.exports = {
  assertSourceAstEqual(expected, actual, options) {
    const expectedTree = stripMeta(
      parse(normalizeSourceCode(expected)).program,
      options,
    );
    const actualTree = stripMeta(
      parse(normalizeSourceCode(actual)).program,
      options,
    );
    try {
      assert.deepStrictEqual(actualTree, expectedTree);
    } catch (e) {
      const jsonDiff = require('json-diff');
      const expectedFormattedCode = prettyPrint(expected);
      const actualFormattedCode = prettyPrint(actual);
      const commonStr = firstCommonSubstring(
        expectedFormattedCode,
        actualFormattedCode,
      );
      const excerptLength = 60;
      const excerptDiffFromExpected = expectedFormattedCode.substr(
        commonStr.length,
        excerptLength,
      );
      const excerptDiffFromActual = actualFormattedCode.substr(
        commonStr.length,
        excerptLength,
      );

      const errMessage = `deepEqual node AST assert failed for the following code:

Expected output: <<<${expectedFormattedCode}>>>

Actual output: <<<${actualFormattedCode}>>>

First common string: <<<${commonStr}>>>

The first difference is (${excerptLength} chars max):

Expected : <<<${excerptDiffFromExpected}>>>

Actual   : <<<${excerptDiffFromActual}>>>

AST diff:
====
${jsonDiff.diffString(actualTree, expectedTree)}
====
`;
      console.error(errMessage);

      const err = new Error(errMessage);
      err.stack = e.stack;
      throw err;
    }
  },

  testSection(testData, transform, options) {
    Object.keys(testData).forEach(test => {
      const testInfo = testData[test];
      it(test, () => {
        if (testInfo.throws === true) {
          expect(() => transform(testInfo.input, testInfo.options)).toThrow();
        } else if (typeof testInfo.throws === 'string') {
          expect(() => transform(testInfo.input, testInfo.options)).toThrow(
            testInfo.throws,
          );
        } else if (testInfo.throws === false) {
          transform(testInfo.input, testInfo.options);
        } else {
          expect(() => {
            this.assertSourceAstEqual(
              testInfo.output,
              transform(testInfo.input, testInfo.options),
              options,
            );
          }).not.toThrow();
        }
      });
    });
  },

  testCase(name, plugins, testData, options) {
    describe(name, () =>
      this.testSection(
        testData,
        getDefaultTransformForPlugins(plugins),
        options,
      ),
    );
  },
};
