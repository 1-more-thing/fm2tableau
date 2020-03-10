/*!
 * FileMaker 2 Tableau
 * Copyright (C) 2020 1-more-thing (http://www.1-more-thing.com)
 * Licensed under GPLv3 (http://www.gnu.org/licenses/)
 */

String.prototype.format = function (data) {
	let formatted = this;
	for (const arg of Object.keys(data)) {
		formatted = formatted.replace("{" + arg + "}", data[arg]);
	}
	return formatted;
};

const FM_DATABASES = '/databases',
	FM_LOGIN = '/databases/{database}/sessions',
	FM_LAYOUTS = '/databases/{database}/layouts',
	FM_LAYOUT = '/databases/{database}/layouts/{layout}/metadata',
	FM_CURSOR = '/databases/{database}/layouts/{layout}/cursor',
	FM_CURSOR_RESET = '/databases/{database}/layouts/{layout}/cursor/reset';

const FileMaker = function () {
	this.host = location.origin;
	this.database = null;
	this.username = null;
	this.password = null;
	this.token = null;
	this.cursor = null;
	this.layout = null;
	this.axios = axios.create({

	});

	//Pseudo Event handler
	this.onTokenChange = null;
	this.onCursorChange= null;


	this.axios.defaults.headers['Content-Type'] = 'application/json';

	this.axios.defaults.baseURL = '/fmi/data/vLatest';

	this.prepareUrl = function (url) {
		return url.format({
			database: this.database,
			layout: this.layout
		});
	};

	this.setDatabase = function (database) {
		this.database = database
	};

	this.setCredentials = function (username, password) {
		this.username = username;
		this.password = password
	};

	this.setCursor = function (cursor) {
		this.cursor = cursor
	};

	this.bearer = function() {
		return "Bearer " + this.token
	};

	this.isFmError = function (response) {
		return response.messages && response.messages[0].code !== '0'
	};

	this.formatFmError = function (response) {
		return {
			code: response.messages[0].code,
			message: response.messages[0].message
		}
	};

	this.parseRequestError = function (e) {
		let error;

		if (e.request && e.request.status === 401) {
			error = {
				code: e.response.status,
				message: e.response.statusText
			}
		} else if (this.isFmError(e.response)) {
			error = this.formatFmError(e.response);
		} else if (e.response) {
			error = {
				code: e.response.status,
				message: e.response.statusText
			}
		} else if (e.request) {
			error = {
				code: -1,
				message: 'Request Error'
			};
		} else {
			error = {
				code: -1,
				message: e.message
			};
		}
		return error
	};

	/**
	 *
	 * @param successCallback Success Callback, token will be provided as parameter
	 * @param errorCallback Callback on error, return formatted error
	 */
	this.getToken = function (successCallback, errorCallback) {
		const url = this.prepareUrl(FM_LOGIN);
		const opts = {
			auth: {
				username: this.username,
				password: this.password
			},
		};

		this.axios.post(url, null, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data));
					return;
				}
				this.token = res.data.response.token;
				if (this.onTokenChange) {
					this.onTokenChange(this.token)
				}
				successCallback(this.token);
			})
			.catch((e) => {
				errorCallback(this.parseRequestError(e));
			});
	};

	/**
	 * @param token
	 * @param successCallback Success Callback, token will be provided as parameter
	 * @param errorCallback Callback on error, return formatted error
	 */
	this.logout = function (token, successCallback, errorCallback) {
		if (token === null) {
			token = this.token;
		}
		//prevent query if no token
		if (!token) {
			successCallback();
		}

		const url = this.prepareUrl(FM_LOGIN) + '/' + token;
		this.axios.delete(url)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data));
					return;
				}
				successCallback();
			})
			.catch((e) => {
				errorCallback(this.parseRequestError(e));
			});
	};

	this.getDatabases = function(successCallback, errorCallback) {
		const url = FM_DATABASES;
		const opts = {
			auth: {
				username: this.username,
				password: this.password
			},
		};
		this.axios.get(url, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data));
					return;
				}
				successCallback(res.data.response.databases);
			})
			.catch((e) => {
				errorCallback(this.parseRequestError(e));
			});
	};

	this.getLayouts = function(successCallback, errorCallback) {
		const url = FM_LAYOUTS;
		const opts = {
			headers: {
				"Authorization": this.bearer()
			}
		};

		this.axios.get(url, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data))
				}
				successCallback(res.data.response.layouts);
			})
			.catch((e) => {
				error = this.parseRequestError(e);
				//handle token expired: regenerate token and run action again
				if (error.code === 401) {
					this.getToken(() => {
						this.getLayouts(successCallback, errorCallback);
					}, errorCallback);
					return;
				}

				errorCallback(this.parseRequestError(e));
			});
	};

	this.getMetaData = function(layout, successCallback, errorCallback) {
		this.layout = layout;
		const url = this.prepareUrl(FM_LAYOUT);
		const opts = {
			headers: {
				"Authorization": this.bearer()
			}
		};

		return this.axios.get(url, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data))
				}
				successCallback(res.data.response.metaData);
			})
			.catch((e) => {
				const error = this.parseRequestError(e);
				//handle token expired: regenerate token and run action again
				if (error.code === 401) {
					this.getToken(() => {
						this.getLayouts(successCallback, errorCallback);
					}, errorCallback);
					return;
				}

				errorCallback(this.parseRequestError(e));
			});
	};

	this.createCursor = function(layout, successCallback, errorCallback) {
		this.layout = layout;
		const url = this.prepareUrl(FM_CURSOR);
		const opts = {
			headers: {
				"Authorization": this.bearer()
			}
		};

		this.axios.post(url, null, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data))
				}
				this.cursor = res.data.response.cursorToken;

				if (this.onCursorChange) {
					this.onCursorChange(this.cursor, layout)
				}
				successCallback(this.cursor);
			})
			.catch((e) => {
				const error = this.parseRequestError(e);
				//handle token expired: regenerate token and run action again
				if (error.code === 401) {
					this.getToken(() => {
						this.createCursor(layout, successCallback, errorCallback);
					}, errorCallback);
					return;
				}

				errorCallback(this.parseRequestError(e));
			});
	};

	this.resetCursor = function(layout, lastRecordId, successCallback, errorCallback) {
		this.layout = layout;
		const url = this.prepareUrl(FM_CURSOR_RESET);
		const opts = {
			headers: {
				"Authorization": this.bearer(),
				"X-FM-Data-Cursor-Token": this.cursor
			}
		};

		let body = null;
		if (lastRecordId) {
			body = JSON.stringify({recordId: lastRecordId.toString()})
		}

		this.axios.post(url, body, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data))
				}
				successCallback(this.cursor);
			})
			.catch((e) => {
				const error = this.parseRequestError(e);
				//handle token expired: regenerate token, cursor and run action again
				if (error.code === 401) {
					this.getToken(() => {
						this.createCursor(layout, () => {
							this.resetCursor(layout, lastRecordId, successCallback, errorCallback)
						}, errorCallback);
					}, errorCallback);
					return;
				}
				errorCallback(this.parseRequestError(e));
			});
	};

	this.fetchRecords = function(layout, pageSize, lastRecordId, successCallback, errorCallback) {
		this.layout = layout;
		const url = this.prepareUrl(FM_CURSOR);
		const opts = {
			headers: {
				"Authorization": this.bearer(),
				"X-FM-Data-Cursor-Token": this.cursor
			}
		};

		if (pageSize) {
			opts.params= {
				'_limit': pageSize
			};
		}

		this.axios.get(url, opts)
			.then((res) => {
				if (this.isFmError(res.data)) {
					errorCallback(this.formatFmError(res.data))
				}
				successCallback(res.data.response.data);
			})
			.catch((e) => {
				const error = this.parseRequestError(e);
				//handle token expired: regenerate token and run action again
				if (error.code === 401) {
					this.getToken(() => {
						// If session expired during process, we need to generate a new cursor and reset its position to last record Id
						this.createCursor(layout, () => {
							this.resetCursor(layout, lastRecordId, () => {
								this.fetchRecords(layout, pageSize, lastRecordId, successCallback, errorCallback);
							}, errorCallback)
						}, errorCallback)
					}, errorCallback);
					return;
				}
				errorCallback(this.parseRequestError(e));
			});
	};

};
