/* eslint-disable no-new, @typescript-eslint/naming-convention */
import {expectType, expectAssignable, expectError} from 'tsd';
import Conf from '../source/index.js';

type UnicornFoo = {
	foo: string;
	unicorn: boolean;
	nested?: {
		prop: number;
	};
	hello?: number;
};

const conf = new Conf<UnicornFoo>({accessPropertiesByDotNotation: true});
new Conf<UnicornFoo>({
	defaults: {
		foo: 'bar',
		unicorn: false,
	},
});
new Conf<UnicornFoo>({configName: ''});
new Conf<UnicornFoo>({projectName: 'foo'});
new Conf<UnicornFoo>({fileExtension: '.foo'});
new Conf<UnicornFoo>({configFileMode: 0o600});
new Conf<UnicornFoo>({clearInvalidConfig: false});
new Conf<UnicornFoo>({serialize: () => 'foo'});
new Conf<UnicornFoo>({deserialize: () => ({foo: 'foo', unicorn: true})});
new Conf<UnicornFoo>({projectSuffix: 'foo'});
new Conf<UnicornFoo>({watch: true});

new Conf<UnicornFoo>({
	schema: {
		foo: {
			type: 'string',
			default: 'foobar',
		},
		unicorn: {
			type: 'boolean',
		},
		hello: {
			type: 'number',
		},
		nested: {
			type: 'object',
			properties: {
				prop: {
					type: 'number',
				},
			},
		},
	},
});

conf.set('hello', 1);
conf.set('unicorn', false);
conf.set({foo: 'nope'});

conf.set('nested.prop', 3);

conf.set({
	nested: {
		prop: 3,
	},
});

expectType<string>(conf.get('foo'));
expectType<string>(conf.get('foo', 'bar'));
conf.delete('foo');
expectType<boolean>(conf.has('foo'));
conf.delete('nested.prop');
expectType<boolean>(conf.has('nested.prop'));
conf.clear();
const off = conf.onDidChange('foo', (oldValue, newValue) => {
	expectAssignable<UnicornFoo[keyof UnicornFoo]>(oldValue);
	expectAssignable<UnicornFoo[keyof UnicornFoo]>(newValue);
});

expectType<() => void>(off);
off();

conf.store = {
	foo: 'bar',
	unicorn: false,
};
expectType<string>(conf.path);
expectType<number>(conf.size);

expectType<IterableIterator<[keyof UnicornFoo, UnicornFoo[keyof UnicornFoo]]>>(
	conf[Symbol.iterator](),
);
for (const [key, value] of conf) {
	expectType<keyof UnicornFoo>(key);
	expectType<UnicornFoo[keyof UnicornFoo]>(value);
}

// -- Docs examples --

type StoreType = {
	isRainbow: boolean;
	unicorn?: string;
};

const config = new Conf<StoreType>({
	defaults: {
		isRainbow: true,
	},
});

config.get('isRainbow');
//=> true

expectType<string>(conf.get('foo', 'bar'));

config.set('unicorn', '🦄');
console.log(config.get('unicorn'));
//=> '🦄'

config.delete('unicorn');
console.log(config.get('unicorn'));
//=> undefined

// Should be stored type or default
expectType<boolean>(config.get('isRainbow'));
expectType<boolean>(config.get('isRainbow', false));

expectType<string | undefined>(config.get('unicorn'));
expectType<string>(config.get('unicorn', 'rainbow'));
// @ts-expect-error
expectError<number>(config.get('unicorn', 1));

// --

// -- Migrations --
new Conf({
	beforeEachMigration(store, context) {
		console.log(`[main-config] migrate from ${context.fromVersion} → ${context.toVersion}`);
		console.log(`[main-config] final migration version ${context.finalVersion}, all migrations that were run or will be ran: ${context.versions.toString()}`);
		console.log(`[main-config] phase ${(store.get('phase') || 'none') as string}`);
	},
	migrations: {
		'0.0.1'(store) {
			store.set('debug phase', true);
		},
		'1.0.0'(store) {
			store.delete('debug phase');
			store.set('phase', '1.0');
		},
		'1.0.2'(store) {
			store.set('phase', '>1.0');
		},
	},
});
// --
