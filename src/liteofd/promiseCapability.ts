export default class PromiseCapability<T> {
	/**
	 * #settled：这是一个私有属性（由 # 前缀表示），包含一个布尔值。它开始时为 false，并在 Promise 被解决或拒绝时设置为 true。
	 * @type {boolean}
	 */
	#settled = false;
	promise: Promise<T>
	resolve!: (data: T) => void
	reject!: (reason: any) => void 

	constructor() {
		/**
		 * 在构造函数内部，它使用 Promise 构造函数创建一个新的 Promise。
		 * Promise 构造函数采用带有两个参数的执行器函数
		 * 它还在执行器函数中定义了两个公共方法：this.resolve  this.reject
		 *
		 * @type {Promise<any>} The Promise object.
		 */
		this.promise = new Promise((resolve, reject) => {
			/**
			 * 此方法采用数据参数并调用提供给 Promise 构造函数的解析函数，从而使用提供的数据有效地实现 Promise。
			 * @type {function} Fulfills the Promise.
			 */
			this.resolve = data => {
				this.#settled = true;
				resolve(data);
			};

			/**
			 * 此方法接受一个原因参数（通常是一个错误）并调用提供给 Promise 构造函数的拒绝函数，从而有效地拒绝带有所提供原因的 Promise。
			 * @type {function} Rejects the Promise.
			 */
			this.reject = reason => {
				this.#settled = true;
				reject(reason);
			};
		});
	}

	/**
	 * 这个 getter 只是返回私有属性 #settled 的值，指示 Promise 是否已被解决或拒绝。
	 * @type {boolean} If the Promise has been fulfilled/rejected.
	 */
	get settled() {
		return this.#settled;
	}
}
