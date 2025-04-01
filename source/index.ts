/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-return */
import {
	getProperty,
	hasProperty,
	setProperty,
	deleteProperty,
} from 'dot-prop';
import {Ajv2020 as Ajv, type ValidateFunction as AjvValidateFunction} from 'ajv/dist/2020.js';
import ajvFormatsModule from 'ajv-formats';
import semver from 'semver';
import {type JSONSchema} from 'json-schema-typed';
import {isEqual} from 'lodash-es';
import {
	type Deserialize,
	type Migrations,
	type OnDidChangeCallback,
	type Options,
	type Serialize,
	type Unsubscribe,
	type OnDidAnyChangeCallback,
	type BeforeEachMigrationCallback,
} from './types.js';

// FIXME: https://github.com/ajv-validator/ajv/issues/2047
const ajvFormats = ajvFormatsModule.default;

const createPlainObject = <T = Record<string, unknown>>(): T => Object.create(null);

const isExist = <T = unknown>(data: T): boolean => data !== undefined && data !== null;

const checkValueType = (key: string, value: unknown): void => {
	const nonJsonTypes = new Set([
		'undefined',
		'symbol',
		'function',
	]);

	const type = typeof value;

	if (nonJsonTypes.has(type)) {
		throw new TypeError(`Setting a value of type \`${type}\` for key \`${key}\` is not allowed as it's not supported by JSON`);
	}
};

const INTERNAL_KEY = '__internal__';
const MIGRATION_KEY = `${INTERNAL_KEY}.migrations.version`;

export default class Conf<T extends Record<string, any> = Record<string, unknown>> implements Iterable<[keyof T, T[keyof T]]> {
	readonly path: string;
	readonly events: EventTarget;
	readonly #validator?: AjvValidateFunction;
	readonly #options: Readonly<Partial<Options<T>>>;
	readonly #defaultValues: Partial<T> = {};

	constructor(partialOptions: Readonly<Partial<Options<T>>> = {}) {
		const options: Partial<Options<T>> = {
			configName: 'config',
			fileExtension: 'json',
			projectSuffix: 'nodejs',
			clearInvalidConfig: false,
			accessPropertiesByDotNotation: true,
			configFileMode: 0o666,
			...partialOptions,
		};

		if (!options.cwd) {
			if (!options.projectName) {
				throw new Error('Please specify the `projectName` option.');
			}

			options.cwd = options.projectName + (options.projectSuffix ? `-${options.projectSuffix}` : '');
		}

		this.#options = options;

		if (options.schema ?? options.ajvOptions ?? options.rootSchema) {
			if (options.schema && typeof options.schema !== 'object') {
				throw new TypeError('The `schema` option must be an object.');
			}

			const ajv = new Ajv({
				allErrors: true,
				useDefaults: true,
				...options.ajvOptions,
			});
			ajvFormats(ajv);

			const schema: JSONSchema = {
				...options.rootSchema,
				type: 'object',
				properties: options.schema,
			};

			this.#validator = ajv.compile(schema);

			for (const [key, value] of Object.entries(options.schema ?? {}) as any) { // TODO: Remove the `as any`.
				if (value?.default) {
					this.#defaultValues[key as keyof T] = value.default; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
				}
			}
		}

		if (options.defaults) {
			this.#defaultValues = {
				...this.#defaultValues,
				...options.defaults,
			};
		}

		if (options.serialize) {
			this._serialize = options.serialize;
		}

		if (options.deserialize) {
			this._deserialize = options.deserialize;
		}

		this.events = new EventTarget();

		const fileExtension = options.fileExtension ? `.${options.fileExtension}` : '';
		this.path = `${options.cwd}/${options.configName ?? 'config'}${fileExtension}`;

		const fileStore = this.store;
		const store = Object.assign(createPlainObject(), options.defaults, fileStore);

		if (options.migrations) {
			if (!options.projectVersion) {
				throw new Error('Please specify the `projectVersion` option.');
			}

			this._migrate(options.migrations, options.projectVersion, options.beforeEachMigration);
		}

		// We defer validation until after migrations are applied so that the store can be updated to the current schema.
		this._validate(store);

		if (!isEqual(fileStore, store)) {
			this.store = store;
		}

		if (options.watch) {
			this._watch();
		}
	}

	/**
	Get an item.

	@param key - The key of the item to get.
	@param defaultValue - The default value if the item does not exist.
	*/
	get<Key extends keyof T>(key: Key): T[Key];
	get<Key extends keyof T>(key: Key, defaultValue: Required<T>[Key]): Required<T>[Key];
	// This overload is used for dot-notation access.
	// We exclude `keyof T` as an incorrect type for the default value should not fall through to this overload.
	get<Key extends string, Value = unknown>(key: Exclude<Key, keyof T>, defaultValue?: Value): Value;
	get(key: string, defaultValue?: unknown): unknown {
		if (this.#options.accessPropertiesByDotNotation) {
			return this._get(key, defaultValue);
		}

		const {store} = this;
		return key in store ? store[key] : defaultValue;
	}

	/**
	Set an item or multiple items at once.

	@param {key|object} - You can use [dot-notation](https://github.com/sindresorhus/dot-prop) in a key to access nested properties. Or a hashmap of items to set at once.
	@param value - Must be JSON serializable. Trying to set the type `undefined`, `function`, or `symbol` will result in a `TypeError`.
	*/
	set<Key extends keyof T>(key: Key, value?: T[Key]): void;
	set(key: string, value: unknown): void;
	set(object: Partial<T>): void;
	set<Key extends keyof T>(key: Partial<T> | Key | string, value?: T[Key] | unknown): void {
		if (typeof key !== 'string' && typeof key !== 'object') {
			throw new TypeError(`Expected \`key\` to be of type \`string\` or \`object\`, got ${typeof key}`);
		}

		if (typeof key !== 'object' && value === undefined) {
			throw new TypeError('Use `delete()` to clear values');
		}

		if (this._containsReservedKey(key)) {
			throw new TypeError(`Please don't use the ${INTERNAL_KEY} key, as it's used to manage this module internal operations.`);
		}

		const {store} = this;

		const set = (key: string, value?: T[Key] | T | unknown): void => {
			checkValueType(key, value);
			if (this.#options.accessPropertiesByDotNotation) {
				setProperty(store, key, value);
			} else {
				store[key as Key] = value as T[Key];
			}
		};

		if (typeof key === 'object') {
			const object = key;
			for (const [key, value] of Object.entries(object)) {
				set(key, value);
			}
		} else {
			set(key, value);
		}

		this.store = store;
	}

	/**
	Check if an item exists.

	@param key - The key of the item to check.
	*/
	has<Key extends keyof T>(key: Key | string): boolean {
		if (this.#options.accessPropertiesByDotNotation) {
			return hasProperty(this.store, key as string);
		}

		return (key as string) in this.store;
	}

	/**
	Reset items to their default values, as defined by the `defaults` or `schema` option.

	@see `clear()` to reset all items.

	@param keys - The keys of the items to reset.
	*/
	reset<Key extends keyof T>(...keys: Key[]): void {
		for (const key of keys) {
			if (isExist(this.#defaultValues[key])) {
				this.set(key, this.#defaultValues[key]);
			}
		}
	}

	/**
	Delete an item.

	@param key - The key of the item to delete.
	*/
	delete<Key extends keyof T>(key: Key): void;
	// This overload is used for dot-notation access.
	delete(key: string): void;
	delete(key: string): void {
		const {store} = this;
		if (this.#options.accessPropertiesByDotNotation) {
			deleteProperty(store, key);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete store[key];
		}

		this.store = store;
	}

	/**
	Delete all items.

	This resets known items to their default values, if defined by the `defaults` or `schema` option.
	*/
	clear(): void {
		this.store = createPlainObject();

		for (const key of Object.keys(this.#defaultValues)) {
			this.reset(key);
		}
	}

	/**
	Watches the given `key`, calling `callback` on any changes.

	@param key - The key to watch.
	@param callback - A callback function that is called on any changes. When a `key` is first set `oldValue` will be `undefined`, and when a key is deleted `newValue` will be `undefined`.
	@returns A function, that when called, will unsubscribe.
	*/
	onDidChange<Key extends keyof T>(
		key: Key,
		callback: OnDidChangeCallback<T[Key]>,
	): Unsubscribe {
		if (typeof key !== 'string') {
			throw new TypeError(`Expected \`key\` to be of type \`string\`, got ${typeof key}`);
		}

		if (typeof callback !== 'function') {
			throw new TypeError(`Expected \`callback\` to be of type \`function\`, got ${typeof callback}`);
		}

		return this._handleChange(() => this.get(key), callback);
	}

	/**
	Watches the whole config object, calling `callback` on any changes.

	@param callback - A callback function that is called on any changes. When a `key` is first set `oldValue` will be `undefined`, and when a key is deleted `newValue` will be `undefined`.
	@returns A function, that when called, will unsubscribe.
	*/
	onDidAnyChange(
		callback: OnDidAnyChangeCallback<T>,
	): Unsubscribe {
		if (typeof callback !== 'function') {
			throw new TypeError(`Expected \`callback\` to be of type \`function\`, got ${typeof callback}`);
		}

		return this._handleChange(() => this.store, callback);
	}

	get size(): number {
		return Object.keys(this.store).length;
	}

	get store(): T {
		try {
			const data = localStorage.getItem(this.path) ?? undefined;
			const dataString = this._encryptData(data);
			const deserializedData = this._deserialize(dataString);
			this._validate(deserializedData);
			return Object.assign(createPlainObject(), deserializedData);
		} catch (error: unknown) {
			if ((error as any)?.code === 'ENOENT') {
				this._ensureDirectory();
				return createPlainObject();
			}

			if (this.#options.clearInvalidConfig && (error as Error).name === 'SyntaxError') {
				return createPlainObject();
			}

			throw error;
		}
	}

	set store(value: T) {
		this._ensureDirectory();

		this._validate(value);
		this._write(value);

		this.events.dispatchEvent(new Event('change'));
	}

	* [Symbol.iterator](): IterableIterator<[keyof T, T[keyof T]]> {
		for (const [key, value] of Object.entries(this.store)) {
			yield [key, value];
		}
	}

	private _encryptData(data?: string): string {
		return data ? data.toString() : JSON.stringify(createPlainObject());
	}

	private _handleChange<Key extends keyof T>(
		getter: () => T | undefined,
		callback: OnDidAnyChangeCallback<T[Key]>
	): Unsubscribe;

	private _handleChange<Key extends keyof T>(
		getter: () => T[Key] | undefined,
		callback: OnDidChangeCallback<T[Key]>
	): Unsubscribe;

	private _handleChange<Key extends keyof T>(
		getter: () => T | T[Key] | undefined,
		callback: OnDidAnyChangeCallback<T | T[Key]> | OnDidChangeCallback<T | T[Key]>,
	): Unsubscribe {
		let currentValue = getter();

		const onChange = (): void => {
			const oldValue = currentValue;
			const newValue = getter();

			if (isEqual(newValue, oldValue)) {
				return;
			}

			currentValue = newValue;
			callback.call(this, newValue, oldValue);
		};

		this.events.addEventListener('change', onChange);

		return () => {
			this.events.removeEventListener('change', onChange);
		};
	}

	private readonly _deserialize: Deserialize<T> = value => JSON.parse(value);
	private readonly _serialize: Serialize<T> = value => JSON.stringify(value, undefined, '\t');

	private _validate(data: T | unknown): void {
		if (!this.#validator) {
			return;
		}

		const valid = this.#validator(data);
		if (valid || !this.#validator.errors) {
			return;
		}

		const errors = this.#validator.errors
			.map(({instancePath, message = ''}) => `\`${instancePath.slice(1)}\` ${message}`);
		throw new Error('Config schema violation: ' + errors.join('; '));
	}

	private _ensureDirectory(): void {
		// Ensure the directory exists as it could have been deleted in the meantime.
	}

	private _write(value: T): void {
		const data: string = this._serialize(value);

		localStorage.setItem(this.path, data);
	}

	private _watch(): void {
		this._ensureDirectory();

		window.addEventListener('storage', (event: StorageEvent) => {
			if (event.key === this.path) {
				this.events.dispatchEvent(new Event('change'));
			}
		}, false);
	}

	private _migrate(migrations: Migrations<T>, versionToMigrate: string, beforeEachMigration?: BeforeEachMigrationCallback<T>): void {
		let previousMigratedVersion = this._get(MIGRATION_KEY, '0.0.0');

		const newerVersions = Object.keys(migrations)
			.filter(candidateVersion => this._shouldPerformMigration(candidateVersion, previousMigratedVersion, versionToMigrate));

		let storeBackup = {...this.store};

		for (const version of newerVersions) {
			try {
				if (beforeEachMigration) {
					beforeEachMigration(this, {
						fromVersion: previousMigratedVersion,
						toVersion: version,
						finalVersion: versionToMigrate,
						versions: newerVersions,
					});
				}

				const migration = migrations[version];
				migration?.(this);

				this._set(MIGRATION_KEY, version);

				previousMigratedVersion = version;
				storeBackup = {...this.store};
			} catch (error: unknown) {
				this.store = storeBackup;

				throw new Error(
					`Something went wrong during the migration! Changes applied to the store until this failed migration will be restored. ${error as string}`,
				);
			}
		}

		if (this._isVersionInRangeFormat(previousMigratedVersion) || !semver.eq(previousMigratedVersion, versionToMigrate)) {
			this._set(MIGRATION_KEY, versionToMigrate);
		}
	}

	private _containsReservedKey(key: string | Partial<T>): boolean {
		if (typeof key === 'object') {
			const firsKey = Object.keys(key)[0];

			if (firsKey === INTERNAL_KEY) {
				return true;
			}
		}

		if (typeof key !== 'string') {
			return false;
		}

		if (this.#options.accessPropertiesByDotNotation) {
			if (key.startsWith(`${INTERNAL_KEY}.`)) {
				return true;
			}

			return false;
		}

		return false;
	}

	private _isVersionInRangeFormat(version: string): boolean {
		return semver.clean(version) === null;
	}

	private _shouldPerformMigration(candidateVersion: string, previousMigratedVersion: string, versionToMigrate: string): boolean {
		if (this._isVersionInRangeFormat(candidateVersion)) {
			if (previousMigratedVersion !== '0.0.0' && semver.satisfies(previousMigratedVersion, candidateVersion)) {
				return false;
			}

			return semver.satisfies(versionToMigrate, candidateVersion);
		}

		if (semver.lte(candidateVersion, previousMigratedVersion)) {
			return false;
		}

		if (semver.gt(candidateVersion, versionToMigrate)) {
			return false;
		}

		return true;
	}

	private _get<Key extends keyof T>(key: Key): T[Key] | undefined;
	private _get<Key extends keyof T, Default = unknown>(key: Key, defaultValue: Default): T[Key] | Default;
	private _get<Key extends keyof T, Default = unknown>(key: Key | string, defaultValue?: Default): Default | undefined {
		return getProperty(this.store, key as string, defaultValue as T[Key]);
	}

	private _set(key: string, value: unknown): void {
		const {store} = this;
		setProperty(store, key, value);

		this.store = store;
	}
}

export type {Options, Schema} from './types.js';
