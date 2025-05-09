/* eslint-disable no-new, @typescript-eslint/no-empty-function, @typescript-eslint/naming-convention, n/no-unsupported-features/node-builtins */
import path from 'node:path';
import {temporaryDirectory} from 'tempy';
import {deleteSync} from 'del';
import anyTest, {type TestFn} from 'ava';
import {LocalStorage} from 'node-localstorage';
import Conf, {type Schema} from '../source/index.js';

global.localStorage = new LocalStorage('./.cache');
localStorage.clear();

const test = anyTest as TestFn<{
	config: Conf;
	configWithoutDotNotation: Conf;
	configWithSchema: Conf<{foo: unknown; bar: unknown}>;
	configWithDefaults: Conf;
}>;

const fixture = '🦄';

test.beforeEach(t => {
	t.context.config = new Conf({cwd: temporaryDirectory()});
	t.context.configWithoutDotNotation = new Conf({cwd: temporaryDirectory(), accessPropertiesByDotNotation: false});
});

test('.get()', t => {
	t.is(t.context.config.get('foo'), undefined);
	t.is(t.context.config.get('foo', '🐴'), '🐴');
	t.context.config.set('foo', fixture);
	t.is(t.context.config.get('foo'), fixture);
});

test('.get() - `defaults` option', t => {
	const store = new Conf({
		cwd: temporaryDirectory(),
		defaults: {
			foo: 42,
			nested: {
				bar: 55,
			},
		},
	});

	t.is(store.get('foo'), 42);
	t.is(store.get('nested.bar'), 55);
});

test.failing('.get() - `schema` option - default', t => {
	const store = new Conf({
		cwd: temporaryDirectory(),
		schema: {
			foo: {
				type: 'boolean',
				default: true,
			},
			nested: {
				type: 'object',
				properties: {
					bar: {
						type: 'number',
						default: 55,
					},
				},
			},
		},
	});

	t.is(store.get('foo'), true);
	t.is(store.get('nested.bar'), 55); // See: https://github.com/sindresorhus/electron-store/issues/102
});

test('.set()', t => {
	t.context.config.set('foo', fixture);
	t.context.config.set('baz.boo', fixture);
	t.is(t.context.config.get('foo'), fixture);
	t.is(t.context.config.get('baz.boo'), fixture);
});

test('.set() - with object', t => {
	t.context.config.set({
		foo1: 'bar1',
		foo2: 'bar2',
		baz: {
			boo: 'foo',
			foo: {
				bar: 'baz',
			},
		},
	});
	t.is(t.context.config.get('foo1'), 'bar1');
	t.is(t.context.config.get('foo2'), 'bar2');
	t.deepEqual(t.context.config.get('baz'), {boo: 'foo', foo: {bar: 'baz'}});
	t.is(t.context.config.get('baz.boo'), 'foo');
	t.deepEqual(t.context.config.get('baz.foo'), {bar: 'baz'});
	t.is(t.context.config.get('baz.foo.bar'), 'baz');
});

test('.set() - with undefined', t => {
	t.throws(() => {
		t.context.config.set('foo', undefined);
	}, {message: 'Use `delete()` to clear values'});
});

test('.set() - with unsupported values', t => {
	t.throws(() => {
		t.context.config.set('a', () => {});
	}, {message: /not supported by JSON/});

	t.throws(() => {
		t.context.config.set('a', Symbol('a'));
	}, {message: /not supported by JSON/});

	t.throws(() => {
		t.context.config.set({
			a: undefined,
		});
	}, {message: /not supported by JSON/});

	t.throws(() => {
		t.context.config.set({
			a() {},
		});
	}, {message: /not supported by JSON/});

	t.throws(() => {
		t.context.config.set({
			a: Symbol('a'),
		});
	}, {message: /not supported by JSON/});
});

test('.set() - invalid key', t => {
	t.throws(() => {
		// For our tests to fail and TypeScript to compile, we'll ignore this TS error.
		// @ts-expect-error
		t.context.config.set(1, 'unicorn');
	}, {message: 'Expected `key` to be of type `string` or `object`, got number'});
});

test('.has()', t => {
	t.context.config.set('foo', fixture);
	t.context.config.set('baz.boo', fixture);
	t.true(t.context.config.has('foo'));
	t.true(t.context.config.has('baz.boo'));
	t.false(t.context.config.has('missing'));
});

test('.reset() - `defaults` option', t => {
	const store = new Conf({
		cwd: temporaryDirectory(),
		defaults: {
			foo: 42,
			bar: 99,
		},
	});

	store.set('foo', 77);
	store.set('bar', 0);
	store.reset('foo', 'bar');
	t.is(store.get('foo'), 42);
	t.is(store.get('bar'), 99);
});

test('.reset() - falsy `defaults` option', t => {
	const defaultsValue: {
		foo: number;
		bar: string;
		fox: boolean;
		bax: boolean;
	} = {
		foo: 0,
		bar: '',
		fox: false,
		bax: true,
	};
	const store = new Conf({
		cwd: temporaryDirectory(),
		defaults: defaultsValue,
	});

	store.set('foo', 5);
	store.set('bar', 'exist');
	store.set('fox', true);
	store.set('fox', false);

	store.reset('foo', 'bar', 'fox', 'bax');

	t.is(store.get('foo'), 0);
	t.is(store.get('bar'), '');
	t.is(store.get('fox'), false);
	t.is(store.get('bax'), true);
});

test('.reset() - `schema` option', t => {
	const store = new Conf({
		cwd: temporaryDirectory(),
		schema: {
			foo: {
				default: 42,
			},
			bar: {
				default: 99,
			},
		},
	});

	store.set('foo', 77);
	store.set('bar', 0);
	store.reset('foo', 'bar');
	t.is(store.get('foo'), 42);
	t.is(store.get('bar'), 99);
});

test('.delete()', t => {
	const {config} = t.context;
	config.set('foo', 'bar');
	config.set('baz.boo', true);
	config.set('baz.foo.bar', 'baz');
	config.delete('foo');
	t.is(config.get('foo'), undefined);
	config.delete('baz.boo');
	t.not(config.get('baz.boo'), true);
	config.delete('baz.foo');
	t.not(config.get('baz.foo'), {bar: 'baz'});
	config.set('foo.bar.baz', {awesome: 'icecream'});
	config.set('foo.bar.zoo', {awesome: 'redpanda'});
	config.delete('foo.bar.baz');
	t.is(config.get('foo.bar.zoo.awesome'), 'redpanda');
});

test('.clear()', t => {
	t.context.config.set('foo', 'bar');
	t.context.config.set('foo1', 'bar1');
	t.context.config.set('baz.boo', true);
	t.context.config.clear();
	t.is(t.context.config.size, 0);
});

test('.clear() - `defaults` option', t => {
	const store = new Conf({
		cwd: temporaryDirectory(),
		defaults: {
			foo: 42,
			bar: 99,
		},
	});

	store.set('foo', 2);
	store.clear();
	t.is(store.get('foo'), 42);
	t.is(store.get('bar'), 99);
});

test('.clear() - `schema` option', t => {
	const store = new Conf({
		cwd: temporaryDirectory(),
		schema: {
			foo: {
				default: 42,
			},
			bar: {
				default: 99,
			},
		},
	});

	store.set('foo', 2);
	store.clear();
	t.is(store.get('foo'), 42);
	t.is(store.get('bar'), 99);
});

test('.size', t => {
	t.context.config.set('foo', 'bar');
	t.is(t.context.config.size, 1);
});

test('.store', t => {
	t.context.config.set('foo', 'bar');
	t.context.config.set('baz.boo', true);
	t.deepEqual(t.context.config.store, {
		foo: 'bar',
		baz: {
			boo: true,
		},
	});
});

test('`defaults` option', t => {
	const config = new Conf({
		cwd: temporaryDirectory(),
		defaults: {
			foo: 'bar',
		},
	});

	t.is(config.get('foo'), 'bar');
});

test('`configName` option', t => {
	const configName = 'alt-config';
	const config = new Conf<{foo: string | undefined}>({
		cwd: temporaryDirectory(),
		configName,
	});
	t.is(config.get('foo'), undefined);
	config.set('foo', fixture);
	t.is(config.get('foo'), fixture);
	t.is(path.basename(config.path, '.json'), configName);
	t.true(Boolean(localStorage.getItem(config.path)));
});

test('no `suffix` option', t => {
	const config = new Conf({projectName: Date.now().toString()});
	t.true(config.path.includes('-nodejs'));
	config.clear();
});

test('with `suffix` option set to empty string', t => {
	const projectSuffix = '';
	const projectName = 'conf-temp1-project';
	const config = new Conf({projectSuffix, projectName});
	const configPathSegments = config.path.split('/');
	const configRootIndex = configPathSegments.indexOf(projectName);
	t.true(configRootIndex !== -1 && configRootIndex < configPathSegments.length);
});

test('with `projectSuffix` option set to non-empty string', t => {
	const projectSuffix = 'new-projectSuffix';
	const projectName = 'conf-temp2-project';
	const config = new Conf({projectSuffix, projectName});
	const configPathSegments = config.path.split('/');
	const expectedRootName = `${projectName}-${projectSuffix}`;
	const configRootIndex = configPathSegments.indexOf(expectedRootName);
	t.true(configRootIndex !== -1 && configRootIndex < configPathSegments.length);
});

test('`fileExtension` option', t => {
	const fileExtension = 'alt-ext';
	const config = new Conf({
		cwd: temporaryDirectory(),
		fileExtension,
	});
	t.is(config.get('foo'), undefined);
	config.set('foo', fixture);
	t.is(config.get('foo'), fixture);
	t.is(path.extname(config.path), `.${fileExtension}`);
});

test('`fileExtension` option = empty string', t => {
	const configName = 'unicorn';
	const config = new Conf({
		cwd: temporaryDirectory(),
		fileExtension: '',
		configName,
	});
	t.is(path.basename(config.path), configName);
});

test('`projectName` option', t => {
	const projectName = 'conf-fixture-project-name';
	const config = new Conf({projectName});
	t.is(config.get('foo'), undefined);
	config.set('foo', fixture);
	t.is(config.get('foo'), fixture);
	t.true(config.path.includes(projectName));
	deleteSync(config.path, {force: true});
});

test('ensure `.store` is always an object', t => {
	const cwd = temporaryDirectory();
	const config = new Conf({cwd});

	deleteSync(cwd, {force: true});

	t.notThrows(() => {
		config.get('foo');
	});
});

test('instance is iterable', t => {
	t.context.config.set({
		foo: fixture,
		bar: fixture,
	});
	t.deepEqual(
		[...t.context.config],
		[['foo', fixture], ['bar', fixture]],
	);
});

test('`cwd` option overrides `projectName` option', t => {
	const cwd = temporaryDirectory();

	t.notThrows(() => {
		const config: Conf = new Conf({cwd, projectName: ''});
		t.true(config.path.startsWith(cwd));
		t.is(config.get('foo'), undefined);
		config.set('foo', fixture);
		t.is(config.get('foo'), fixture);
		deleteSync(config.path, {force: true});
	});
});

test('onDidChange()', t => {
	const {config} = t.context;

	t.plan(8);

	const checkFoo = (newValue: unknown, oldValue: unknown): void => {
		t.is(newValue, '🐴');
		t.is(oldValue, fixture);
	};

	const checkBaz = (newValue: unknown, oldValue: unknown): void => {
		t.is(newValue, '🐴');
		t.is(oldValue, fixture);
	};

	config.set('foo', fixture);
	let unsubscribe = config.onDidChange('foo', checkFoo);
	config.set('foo', '🐴');
	unsubscribe();
	config.set('foo', fixture);

	config.set('baz.boo', fixture);
	unsubscribe = config.onDidChange('baz.boo', checkBaz);
	config.set('baz.boo', '🐴');
	unsubscribe();
	config.set('baz.boo', fixture);

	const checkUndefined = (newValue: unknown, oldValue: unknown): void => {
		t.is(oldValue, fixture);
		t.is(newValue, undefined);
	};

	const checkSet = (newValue: unknown, oldValue: unknown): void => {
		t.is(oldValue, undefined);
		t.is(newValue, '🐴');
	};

	unsubscribe = config.onDidChange('foo', checkUndefined);
	config.delete('foo');
	unsubscribe();
	unsubscribe = config.onDidChange('foo', checkSet);
	config.set('foo', '🐴');
	unsubscribe();
	config.set('foo', fixture);
});

test('onDidAnyChange()', t => {
	const {config} = t.context;

	t.plan(8);

	const checkFoo = (newValue: unknown, oldValue: unknown): void => {
		t.deepEqual(newValue, {foo: '🐴'});
		t.deepEqual(oldValue, {foo: fixture});
	};

	const checkBaz = (newValue: unknown, oldValue: unknown): void => {
		t.deepEqual(newValue, {
			foo: fixture,
			baz: {boo: '🐴'},
		});
		t.deepEqual(oldValue, {
			foo: fixture,
			baz: {boo: fixture},
		});
	};

	config.set('foo', fixture);
	let unsubscribe = config.onDidAnyChange(checkFoo);
	config.set('foo', '🐴');
	unsubscribe();
	config.set('foo', fixture);

	config.set('baz.boo', fixture);
	unsubscribe = config.onDidAnyChange(checkBaz);
	config.set('baz.boo', '🐴');
	unsubscribe();
	config.set('baz.boo', fixture);

	const checkUndefined = (newValue: unknown, oldValue: unknown): void => {
		t.deepEqual(oldValue, {
			foo: '🦄',
			baz: {boo: '🦄'},
		});

		t.deepEqual(newValue, {
			baz: {boo: fixture},
		});
	};

	const checkSet = (newValue: unknown, oldValue: unknown): void => {
		t.deepEqual(oldValue, {
			baz: {boo: fixture},
		});

		t.deepEqual(newValue, {
			baz: {boo: '🦄'},
			foo: '🐴',
		});
	};

	unsubscribe = config.onDidAnyChange(checkUndefined);
	config.delete('foo');
	unsubscribe();
	unsubscribe = config.onDidAnyChange(checkSet);
	config.set('foo', '🐴');
	unsubscribe();
	config.set('foo', fixture);
});

// See #32
test('doesn\'t write to disk upon instanciation if and only if the store didn\'t change', t => {
	let exists = Boolean(localStorage.getItem(t.context.config.path));
	t.is(exists, false);

	const conf = new Conf({
		cwd: temporaryDirectory(),
		defaults: {
			foo: 'bar',
		},
	});
	exists = Boolean(localStorage.getItem(conf.path));
	t.is(exists, true);
});

test('`clearInvalidConfig` option - invalid data', t => {
	const config = new Conf({cwd: temporaryDirectory(), clearInvalidConfig: false});
	localStorage.setItem(config.path, '🦄');

	t.throws(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		config.store;
	}, {instanceOf: SyntaxError});
});

test('`clearInvalidConfig` option - valid data', t => {
	const config = new Conf({cwd: temporaryDirectory(), clearInvalidConfig: false});
	config.set('foo', 'bar');
	t.deepEqual(config.store, {foo: 'bar'});
});

test('schema - should be an object', t => {
	const schema: any = 'object';
	t.throws(() => {
		new Conf({cwd: temporaryDirectory(), schema}); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
	}, {message: 'The `schema` option must be an object.'});
});

test('schema - valid set', t => {
	const schema: Schema<{foo: {bar: number; foobar: number}}> = {
		foo: {
			type: 'object',
			properties: {
				bar: {
					type: 'number',
				},
				foobar: {
					type: 'number',
					maximum: 100,
				},
			},
		},
	};
	const config = new Conf({cwd: temporaryDirectory(), schema});
	t.notThrows(() => {
		config.set('foo', {bar: 1, foobar: 2});
	});
});

test('schema - one violation', t => {
	const config = new Conf({
		cwd: temporaryDirectory(),
		schema: {
			foo: {
				type: 'string',
			},
		},
	});
	t.throws(() => {
		config.set('foo', 1);
	}, {message: 'Config schema violation: `foo` must be string'});
});

test('schema - multiple violations', t => {
	const schema: Schema<{foo: {bar: number; foobar: number}}> = {
		foo: {
			type: 'object',
			properties: {
				bar: {
					type: 'number',
				},
				foobar: {
					type: 'number',
					maximum: 100,
				},
			},
		},
	};
	const config = new Conf({cwd: temporaryDirectory(), schema});
	t.throws(() => {
		config.set('foo', {bar: '1', foobar: 101});
	}, {message: 'Config schema violation: `foo/bar` must be number; `foo/foobar` must be <= 100'});
});

test('schema - complex schema', t => {
	const schema: Schema<{foo: string; bar: number[]}> = {
		foo: {
			type: 'string',
			maxLength: 3,
			pattern: '[def]+',
		},
		bar: {
			type: 'array',
			uniqueItems: true,
			maxItems: 3,
			items: {
				type: 'integer',
			},
		},
	};
	const config = new Conf({cwd: temporaryDirectory(), schema});
	t.throws(() => {
		config.set('foo', 'abca');
	}, {message: 'Config schema violation: `foo` must NOT have more than 3 characters; `foo` must match pattern "[def]+"'});
	t.throws(() => {
		config.set('bar', [1, 1, 2, 'a']);
	}, {message: 'Config schema violation: `bar` must NOT have more than 3 items; `bar/3` must be integer; `bar` must NOT have duplicate items (items ## 1 and 0 are identical)'});
});

test('schema - supports formats', t => {
	const config = new Conf({
		cwd: temporaryDirectory(),
		schema: {
			foo: {
				type: 'string',
				format: 'uri',
			},
		},
	});
	t.throws(() => {
		config.set('foo', 'bar');
	}, {message: 'Config schema violation: `foo` must match format "uri"'});
});

test('schema - invalid write to config file', t => {
	const schema: Schema<{foo: string}> = {
		foo: {
			type: 'string',
		},
	};
	const cwd = temporaryDirectory();

	const config = new Conf({cwd, schema});
	localStorage.setItem([cwd, 'config.json'].join('/'), JSON.stringify({foo: 1}));
	t.throws(() => {
		config.get('foo');
	}, {message: 'Config schema violation: `foo` must be string'});
});

test('schema - default', t => {
	const schema: Schema<{foo: string}> = {
		foo: {
			type: 'string',
			default: 'bar',
		},
	};
	const config = new Conf({
		cwd: temporaryDirectory(),
		schema,
	});

	const foo: string = config.get('foo', '');
	t.is(foo, 'bar');
});

test('schema - Conf defaults overwrites schema default', t => {
	const schema: Schema<{foo: string}> = {
		foo: {
			type: 'string',
			default: 'bar',
		},
	};
	const config = new Conf({
		cwd: temporaryDirectory(),
		defaults: {
			foo: 'foo',
		},
		schema,
	});
	t.is(config.get('foo'), 'foo');
});

test('schema - validate Conf default', t => {
	const schema: Schema<{foo: string}> = {
		foo: {
			type: 'string',
		},
	};
	t.throws(() => {
		new Conf({
			cwd: temporaryDirectory(),
			defaults: {
				// For our tests to fail and typescript to compile, we'll ignore this ts error.
				// This error is not bad and means the package is well typed.
				// @ts-expect-error
				foo: 1,
			},
			schema,
		});
	}, {message: 'Config schema violation: `foo` must be string'});
});

test('schema - validate rootSchema', t => {
	t.throws(() => {
		const config = new Conf({
			cwd: temporaryDirectory(),
			rootSchema: {
				additionalProperties: false,
			},
		});
		config.set('foo', 'bar');
	}, {message: 'Config schema violation: `` must NOT have additional properties'});
});

test('AJV - validate AJV options', t => {
	const config = new Conf({
		cwd: temporaryDirectory(),
		ajvOptions: {
			removeAdditional: true,
		},
		rootSchema: {
			additionalProperties: false,
		},
	});
	config.set('foo', 'bar');
	t.is(config.get('foo'), undefined);
});

test('.get() - without dot notation', t => {
	t.is(t.context.configWithoutDotNotation.get('foo'), undefined);
	t.is(t.context.configWithoutDotNotation.get('foo', '🐴'), '🐴');
	t.context.configWithoutDotNotation.set('foo', fixture);
	t.is(t.context.configWithoutDotNotation.get('foo'), fixture);
});

test('.set() - without dot notation', t => {
	t.context.configWithoutDotNotation.set('foo', fixture);
	t.context.configWithoutDotNotation.set('baz.boo', fixture);
	t.is(t.context.configWithoutDotNotation.get('foo'), fixture);
	t.is(t.context.configWithoutDotNotation.get('baz.boo'), fixture);
});

test('.set() - with object - without dot notation', t => {
	t.context.configWithoutDotNotation.set({
		foo1: 'bar1',
		foo2: 'bar2',
		baz: {
			boo: 'foo',
			foo: {
				bar: 'baz',
			},
		},
	});
	t.is(t.context.configWithoutDotNotation.get('foo1'), 'bar1');
	t.is(t.context.configWithoutDotNotation.get('foo2'), 'bar2');
	t.deepEqual(t.context.configWithoutDotNotation.get('baz'), {boo: 'foo', foo: {bar: 'baz'}});
	t.is(t.context.configWithoutDotNotation.get('baz.boo'), undefined);
	t.is(t.context.configWithoutDotNotation.get('baz.foo.bar'), undefined);
});

test('.has() - without dot notation', t => {
	t.context.configWithoutDotNotation.set('foo', fixture);
	t.context.configWithoutDotNotation.set('baz.boo', fixture);
	t.true(t.context.configWithoutDotNotation.has('foo'));
	t.true(t.context.configWithoutDotNotation.has('baz.boo'));
	t.false(t.context.configWithoutDotNotation.has('missing'));
});

test('.delete() - without dot notation', t => {
	const {configWithoutDotNotation} = t.context;
	configWithoutDotNotation.set('foo', 'bar');
	configWithoutDotNotation.set('baz.boo', true);
	configWithoutDotNotation.set('baz.foo.bar', 'baz');
	configWithoutDotNotation.delete('foo');
	t.is(configWithoutDotNotation.get('foo'), undefined);
	configWithoutDotNotation.delete('baz.boo');
	t.not(configWithoutDotNotation.get('baz.boo'), true);
	configWithoutDotNotation.delete('baz.foo');
	t.not(configWithoutDotNotation.get('baz.foo'), {bar: 'baz'});
	configWithoutDotNotation.set('foo.bar.baz', {awesome: 'icecream'});
	configWithoutDotNotation.set('foo.bar.zoo', {awesome: 'redpanda'});
	configWithoutDotNotation.delete('foo.bar.baz');
	t.deepEqual(configWithoutDotNotation.get('foo.bar.zoo'), {awesome: 'redpanda'});
});

test('migrations - should save the project version as the initial migrated version', t => {
	const cwd = temporaryDirectory();

	const conf = new Conf({cwd, projectVersion: '0.0.2', migrations: {}});

	t.is(conf.get('__internal__.migrations.version'), '0.0.2');
});

test('migrations - should save the project version when a migration occurs', t => {
	const cwd = temporaryDirectory();

	const migrations = {
		'0.0.3'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
	};

	const conf = new Conf({cwd, projectVersion: '0.0.2', migrations});

	t.is(conf.get('__internal__.migrations.version'), '0.0.2');

	const conf2 = new Conf({cwd, projectVersion: '0.0.4', migrations});

	t.is(conf2.get('__internal__.migrations.version'), '0.0.4');
	t.is(conf2.get('foo'), 'cool stuff');
});

test('migrations - should NOT run the migration when the version doesn\'t change', t => {
	const cwd = temporaryDirectory();

	const migrations = {
		'1.0.0'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
	};

	const conf = new Conf({cwd, projectVersion: '0.0.2', migrations});
	t.is(conf.get('__internal__.migrations.version'), '0.0.2');
	t.false(conf.has('foo'));

	const conf2 = new Conf({cwd, projectVersion: '0.0.2', migrations});

	t.is(conf2.get('__internal__.migrations.version'), '0.0.2');
	t.false(conf2.has('foo'));
});

test('migrations - should run the migration when the version changes', t => {
	const cwd = temporaryDirectory();

	const migrations = {
		'1.0.0'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
	};

	const conf = new Conf({cwd, projectVersion: '0.0.2', migrations});
	t.is(conf.get('__internal__.migrations.version'), '0.0.2');
	t.false(conf.has('foo'));

	const conf2 = new Conf({cwd, projectVersion: '1.1.0', migrations});

	t.is(conf2.get('__internal__.migrations.version'), '1.1.0');
	t.true(conf2.has('foo'));
	t.is(conf2.get('foo'), 'cool stuff');
});

test('migrations - should run the migration when the version uses semver comparisons', t => {
	const cwd = temporaryDirectory();
	const migrations = {
		'>=1.0'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
	};

	const conf = new Conf({cwd, projectVersion: '1.0.2', migrations});
	t.is(conf.get('__internal__.migrations.version'), '1.0.2');
	t.is(conf.get('foo'), 'cool stuff');
});

test('migrations - should run the migration when the version uses multiple semver comparisons', t => {
	const cwd = temporaryDirectory();
	const migrations = {
		'>=1.0'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
		'>2.0.0'(store: Conf) {
			store.set('foo', 'modern cool stuff');
		},
	};

	const conf = new Conf({cwd, projectVersion: '1.0.2', migrations});
	t.is(conf.get('__internal__.migrations.version'), '1.0.2');
	t.is(conf.get('foo'), 'cool stuff');

	const conf2 = new Conf({cwd, projectVersion: '2.0.1', migrations});
	t.is(conf2.get('__internal__.migrations.version'), '2.0.1');
	t.is(conf2.get('foo'), 'modern cool stuff');
});

test('migrations - should run all valid migrations when the version uses multiple semver comparisons', t => {
	const cwd = temporaryDirectory();
	const migrations = {
		'>=1.0'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
		'>2.0.0'(store: Conf) {
			store.set('woof', 'oof');
			store.set('medium', 'yes');
		},
		'<3.0.0'(store: Conf) {
			store.set('woof', 'woof');
			store.set('heart', '❤');
		},
	};

	const conf = new Conf({cwd, projectVersion: '2.4.0', migrations});
	t.is(conf.get('__internal__.migrations.version'), '2.4.0');
	t.is(conf.get('foo'), 'cool stuff');
	t.is(conf.get('medium'), 'yes');
	t.is(conf.get('woof'), 'woof');
	t.is(conf.get('heart'), '❤');
});

test('migrations - should cleanup migrations with non-numeric values', t => {
	const cwd = temporaryDirectory();
	const migrations = {
		'1.0.1-alpha'(store: Conf) {
			store.set('foo', 'cool stuff');
		},
		'>2.0.0-beta'(store: Conf) {
			store.set('woof', 'oof');
			store.set('medium', 'yes');
		},
		'<3.0.0'(store: Conf) {
			store.set('woof', 'woof');
			store.set('heart', '❤');
		},
	};

	const conf = new Conf({cwd, projectVersion: '2.4.0', migrations});
	t.is(conf.get('__internal__.migrations.version'), '2.4.0');
	t.is(conf.get('foo'), 'cool stuff');
	t.is(conf.get('medium'), 'yes');
	t.is(conf.get('woof'), 'woof');
	t.is(conf.get('heart'), '❤');
});

test('migrations - should NOT throw an error when project version is unspecified but there are no migrations', t => {
	const cwd = temporaryDirectory();

	t.notThrows(() => {
		const conf = new Conf({cwd});
		conf.clear();
	});
});

test('migrations - should not create the previous migration key if the migrations aren\'t needed', t => {
	const cwd = temporaryDirectory();

	const conf = new Conf({cwd});
	t.false(conf.has('__internal__.migrations.version'));
});

test('migrations error handling - should rollback changes if a migration failed', t => {
	const cwd = temporaryDirectory();

	const failingMigrations = {
		'1.0.0'(store: Conf) {
			store.set('foo', 'initial update');
		},
		'1.0.1'(store: Conf) {
			store.set('foo', 'updated before crash');

			throw new Error('throw the migration and rollback');

			// eslint-disable-next-line no-unreachable
			store.set('foo', 'can you reach here?');
		},
	};

	const passingMigrations = {
		'1.0.0'(store: Conf) {
			store.set('foo', 'initial update');
		},
	};

	let conf = new Conf({cwd, projectVersion: '1.0.0', migrations: passingMigrations});

	t.throws(() => {
		conf = new Conf({cwd, projectVersion: '1.0.2', migrations: failingMigrations});
	}, {message: /throw the migration and rollback/});

	t.is(conf.get('__internal__.migrations.version'), '1.0.0');
	t.true(conf.has('foo'));
	t.is(conf.get('foo'), 'initial update');
});

test('__internal__ keys - should not be accessible by the user', t => {
	const cwd = temporaryDirectory();

	const conf = new Conf({cwd});

	t.throws(() => {
		conf.set('__internal__.you-shall', 'not-pass');
	}, {message: /Please don't use the __internal__ key/});
});

test('__internal__ keys - should not be accessible by the user even without dot notation', t => {
	const cwd = temporaryDirectory();

	const conf = new Conf({cwd, accessPropertiesByDotNotation: false});

	t.throws(() => {
		conf.set({
			__internal__: {
				'you-shall': 'not-pass',
			},
		});
	}, {message: /Please don't use the __internal__ key/});
});

test('__internal__ keys - should only match specific "__internal__" entry', t => {
	const cwd = temporaryDirectory();

	const conf = new Conf({cwd});

	t.notThrows(() => {
		conf.set('__internal__foo.you-shall', 'not-pass');
	});
});

test('beforeEachMigration - should be called before every migration', t => {
	const conf = new Conf({
		cwd: temporaryDirectory(),
		projectVersion: '2.0.0',
		beforeEachMigration(store, context) {
			store.set(`beforeEachMigration ${context.fromVersion} → ${context.toVersion}`, true);
		},
		migrations: {
			'1.0.0'() {},
			'1.0.1'() {},
			'2.0.1'() {},
		},
	});

	t.true(conf.get('beforeEachMigration 0.0.0 → 1.0.0'));
	t.true(conf.get('beforeEachMigration 1.0.0 → 1.0.1'));
	t.false(conf.has('beforeEachMigration 1.0.1 → 2.0.1'));
});
