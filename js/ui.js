/*
* FileMaker Web Connector for Tableau 10.4+
* Author: Romain Dunand - 1-more-thing
*/

(function () {
		window.app = new Vue({
			el: '#app',
			data: {
				isLoading: false,
				isDbLoading: false,
				isLayoutLoading: false,
				isRelogin: false,
				strings: null,
				auth: {
					username: '',
					password: '',
					database: null,
				},
				token: null,
				layouts: [],
				incremental: null,
				pageSize: 500,
				databaseList: [],
				layoutList: [],
				credentialTimer: null,
				credentialError: null,
				fmConnector: null,
				tableau: null,
			},
			vuetify: new Vuetify({
				theme: {
					//dark: true,
				}
			}),
			computed: {
				isCredentialError: {
					get: function () {
						return Boolean(this.auth.username) && Boolean(this.auth.password) && Boolean(this.auth.database) && Boolean(this.credentialError)
							|| Boolean(this.credentialError) && Boolean(this.auth.database) && !this.isRelogin
					},
					set: function (val) {
						/* if (!val) {
							this.credentialError = null;
						} */
					}
				},
				isValidConfiguration: function () {
					// Login must be valid
					// database is accessible with given credentials
					// all layouts are accessible with given credentials
					return this.token
						&& this.auth.database && this.databaseList.includes(this.auth.database)
						&& this.layouts.length && this.layouts.every((layout) => this.layoutList.includes(layout))
				},
			},
			watch: {
				username: function (val) {
					this.credentialError = null;
				},
				password: function (val) {
					this.credentialError = null;
				},
			},
			methods: {
				credentialChanged() {
					console.log("credentialChanged");
					this.token = null;
					this.getDatabases();
					if (this.auth.database) {
						this.getToken();
					}
				},
				getDatabases() {
					console.log("getDatabases");
					this.isDbLoading = true;
					this.databaseList = [];
					this.credentialError = null;
					const opts = {
						auth: {
							username: this.auth.username,
							password: this.auth.password
						},
					};

					this.isDbLoading = true;
					this.databaseList = [];
					this.credentialError = null;

					var that = this;
					axios
						.get('/fmi/data/vLatest/databases', opts)
						.then(function (res) {

							//clear selected DB if not present anymore
							that.databaseList = res.data.response.databases.map(function (value) {
								return value.name
							});

							if (!that.databaseList.includes(that.database)) {
								that.database = null;
							}

							//Reload layouts if a database is already selected
							if (that.database > 0) {
								that.getLayouts();
							}
						})
						.catch(function (e) {
							if (e.response && e.response.data && e.response.data.messages) {
								that.credentialError = e.response.data.messages[0].message;
							} else if (e.response) {
								that.credentialError = e.response.status + ' ' + e.response.statusText;
							} else if (e.request) {
								that.credentialError = e.request;
							} else {
								that.credentialError = e.message;
							}
						})
						.then(() => {
							that.isDbLoading = false;
						})
				},
				getLayouts() {
					console.log("getLayouts");
					if (!this.auth.database) {
						return;
					}
					this.isLayoutLoading = true;
					this.layoutList = [];

					const opts = {
						baseUrl: '/',
						headers: {
							"Authorization": `bearer ${this.token}`,
							"Content-Type": 'application/json'
						}
					};

					var that = this;
					axios
						.get(`/fmi/data/vLatest/databases/${this.auth.database}/layouts`, opts)
						.then(function (res) {

							that.layoutList = that.parseLayouts(res.data.response.layouts);
							that.layouts.filter(function (layout) {
								return that.layoutList.indexOf(layout) >= 0
							});
						})
						.catch(function (e) {
							if (e.response && e.response.data && e.response.data.messages) {
								that.credentialError = e.response.data.messages[0].message;
							} else if (e.response) {
								that.credentialError = e.response.status + ' ' + e.response.statusText;
							} else if (e.request) {
								that.credentialError = e.request;
							} else {
								that.credentialError = e.message;
							}
						}).then(() => {
						that.isLayoutLoading = false;
					})
				},
				getToken() {
					console.log("getToken");
					//Do not try to login if no database specified
					if (!this.auth.database) {
						return
					}
					const opts = {
						baseUrl: '/',
						auth: {
							username: this.auth.username,
							password: this.auth.password
						},
						headers: {
							"Content-Type": 'application/json'
						}
					};

					var body = {
						'fmDataSource': [this.auth]
					};

					this.isLoading = true;
					this.credentialError = null;

					const auth = JSON.stringify(this.auth);

					axios.post(`/fmi/data/vLatest/databases/${this.auth.database}/sessions`, body, opts)
						.then((res) => {
							this.isLoading = false;
							this.token = res.data.response.token;
							this.getLayouts();
						})
						.catch((e) => {
							this.isLoading = false;
							//Something as changed during authentication, don't display error
							if (auth !== JSON.stringify(this.auth)) {
								return
							}
							if (e.response && e.response.data && e.response.data.messages) {
								this.credentialError = e.response.data.messages[0].message;
							} else if (e.response) {
								this.credentialError = e.response.status + ' ' + e.response.statusText;
							} else if (e.request) {
								this.credentialError = e.request;
							} else {
								this.credentialError = e.message;
							}
						})

				},
				parseLayouts(layouts) {
					var that = this;
					var res = [];
					layouts.forEach(function (item, index) {
						if (item.isFolder) {
							res.push.apply(res, that.parseLayouts(item.folderLayoutNames));
						} else {
							res.push(item.name);
							/*res.push({
								text: item.name,
								value: item.name
							})*/
						}
					});
					return res;
				},
				loadSettings(data) {
					console.log("loadSettings");
					this.auth.database = data.database;
					this.layouts = data.layouts || [];
					this.auth.username = data.username;
					this.auth.password = data.password;
					this.incremental = data.incremental;
					this.pageSize = data.pageSize;
					this.isRelogin = data.isRelogin || false;
					if (!this.isRelogin) {
						this.getDatabases();
						this.getToken();
					}
				},
				connect() {
					console.log("connect");
					const conf = {};
					conf.loginType = "";
					conf.endpoint = location.origin + '/fmi/data/vLatest/';
					conf.database = this.auth.database;
					conf.layouts = this.layouts;
					conf.incremental = this.incremental;
					conf.pageSize = this.pageSize;
					conf.metaData = {};
					conf.cursors = {};
					tableau.connectionData = JSON.stringify(conf);
					tableau.username = this.auth.username;
					tableau.password = this.auth.password;
					if (tableau.phase === tableau.phaseEnum.interactivePhase || tableau.phase === tableau.phaseEnum.authPhase) {
						this.fmConnector.FMLogin();
					}
				},
			},
			created: function () {
				//TODO: handle i18n
				this.strings = lang;
				// this.getDatabases();
			}
		});
	}
)();