/*
* FileMaker Web Connector for Tableau 10.4+
* Author: Romain Dunand - 1-more-thing
*/

(function () {
		const fmConnector = tableau.makeConnector();

		window.app.fmConnector = fmConnector;
		window.app.tableau = tableau;
		fmConnector.filemaker = new FileMaker();

		fmConnector.idRegExp = new RegExp('^[a-zA-Z0-9_]\*$');
		fmConnector.filterId = function (id) {
			return id.replace(/[^\w]+/g, '');
		};

		fmConnector.init = function (callback) {
			var settings = {};
			if (tableau.phase === tableau.phaseEnum.interactivePhase || tableau.phase === tableau.phaseEnum.authPhase) {
				if (tableau.connectionData) {
					var conf = JSON.parse(tableau.connectionData);
					settings = {
						database: conf.database,
						layouts: conf.layouts,
						username: tableau.username,
						password: tableau.password,
						incremental: conf.incremental,
						pageSize: conf.pageSize
					};

					if (tableau.phase === tableau.phaseEnum.authPhase) {
						settings.isRelogin = true;
					}

					//Save token on change
					fmConnector.filemaker.onTokenChange = function (token) {
						const conf = JSON.parse(tableau.connectionData);
						conf.token = token;
						tableau.connectionData = JSON.stringify(conf)
					};

					//Save cursor on change
					fmConnector.filemaker.onCursorChange = function (cursor, layout) {
						const conf = JSON.parse(tableau.connectionData);
						conf.cursors[layout] = cursor;
						tableau.connectionData = JSON.stringify(conf)
					}
				}
			}

			// Refresh databases and layouts
			app.loadSettings(settings);
			//configure FileMaker
			if (tableau.connectionData) {
				const conf = JSON.parse(tableau.connectionData);
				fmConnector.filemaker.setDatabase(conf.database);
				fmConnector.filemaker.setCredentials(tableau.username, tableau.password);
				if (tableau.phase !== tableau.phaseEnum.authPhase) {
					fmConnector.filemaker.getToken(() => {
					}, () => {
					});
				}
			}
			// set tableau.alwaysShowAuthUI to true. This will make Tableau to display custom re-login UI when is re-open.
			tableau.alwaysShowAuthUI = true;
			callback();
		};

		fmConnector.getSchema = function (schemaCallback) {
			const conf = JSON.parse(tableau.connectionData);
			schemaCallback(conf.tableInfos);
		};

		fmConnector.fetchRows = function (table, conf, lastRecordId, doneCallback, successCallback) {
			const pageSize = parseInt(conf.pageSize || 1000);
			const layout = table.tableInfo.id;

			fmConnector.filemaker.fetchRecords(layout, pageSize, lastRecordId,
				(records) => {
					successCallback(records, conf, table, pageSize, lastRecordId, doneCallback);
				},
				(error) => {
					tableau.abortWithError(lang.errorFailedToFetch + " : " + error.message);
				})
		};

		const fetchCallback = function (records, conf, table, pageSize, lastRecordId, doneCallback) {
			let toRet = [];
			if (records.length > 0) {
				const fieldTypes = conf.metaData[table.tableInfo.id].fieldTypes;
				const fieldNames = conf.metaData[table.tableInfo.id].fieldNames;
				records.forEach(function (record) {
					const rec = record.fieldData;
					//convert dates & timestamps
					fieldTypes.forEach((type, i) =>{
						if (type === 'date' || type === 'datetime') {
							const date = rec[fieldNames[i]].substr(0,10).split('/');
							const time = rec[fieldNames[i]].substr(10); // t = ' HH:mm:ss'
							rec[fieldNames[i]] = date[2]+'-'+date[0]+'-'+date[1] + time; // Returns yyyy-MM-dd'
						}
					});
					if (record.hasOwnProperty("recordId")) {
						rec["recordId"] = parseInt(record.recordId);
					}
					toRet.push(rec);
					lastRecordId = record.recordId;
				});
				table.appendRows(toRet);
				if (toRet.length < pageSize) {
					doneCallback();
				} else {
					fmConnector.fetchRows(table, conf, lastRecordId, doneCallback, fetchCallback);
				}
			} else {
				if (lastRecordId == 0) {
					return tableau.abortWithError(lang.errorNoResults);
				} else {
					doneCallback();
				}
			}
		};

		fmConnector.getData = function (table, doneCallback) {
			const conf = JSON.parse(tableau.connectionData);
			const lastRecordId = parseInt(table.incrementValue || 0);
			const layout = table.tableInfo.id;

			if (!conf.cursors[layout]) {
				fmConnector.filemaker.createCursor(layout,
					(cursor) => {
						conf.cursors[layout] = cursor;
						tableau.connectionData = JSON.stringify(conf);
						this.getData(table, doneCallback);
					},
					(error) => {
						tableau.abortWithError(lang.errorCreateCursor + ": " + error.message);
					});
			} else {
				this.filemaker.setCursor(conf.cursors[layout]);
				this.filemaker.resetCursor(layout, lastRecordId,
					() => {
						fmConnector.fetchRows(table, conf, lastRecordId, doneCallback, fetchCallback);
					},
					(error) => {
						tableau.abortWithError(lang.errorResetCursor + ": " + error.message);
					})
			}
		};

		fmConnector.shutdown = function (shutdownCallback) {
			if (tableau.phase === tableau.phaseEnum.gatherDataPhase && fmConnector.reLogin) {
				var conf = JSON.parse(tableau.connectionData);

				fmConnector.filemaker.logout(conf.token,
					() => {
						shutdownCallback()
					},
					(error) => {
						tableau.abortWithError(lang.errorLoginFailed + ": " + error.message);
						shutdownCallback()
					});
			} else {
				shutdownCallback()
			}
		}

		//store field names, types and other resource metaData into tableau.connectionData
		fmConnector.storeMetaData = function (layout, metaData) {
			var dataTypesMap = {
				"text": "string",
				"bool": "bool",
				"date": "date",
				"time": "string",
				"timeStamp": "datetime",
				"number": "float",
				"int": "int"
			};
			var conf = JSON.parse(tableau.connectionData);
			var cols = [];

			conf.metaData[layout] = {
				fieldNames: [],
				fieldTypes: []
			};

			metaData.forEach(function (meta) {
				var isRelated = meta.name.indexOf('::');
				var fieldId = meta.id + (isRelated !== -1 ? '_' + fmConnector.filterId(meta.name.substr(0, isRelated)) : '');

				//skip duplicated field if it is already included and check we support result type
				if (conf.metaData[layout].fieldNames.indexOf(fieldId) === -1 && dataTypesMap.hasOwnProperty(meta.result)) {
					conf.metaData[layout].fieldNames.push(meta.id);
					conf.metaData[layout].fieldTypes.push(dataTypesMap[meta.result]);
					cols.push({
						id: fieldId,
						alias: meta.name,
						dataType: dataTypesMap[meta.result]
					});
				}
			});

			var tableInfo = {
				id: layout,
				alias: layout,
				columns: cols
			};
			// add recordId
			tableInfo.columns.push({
				id: "recordId",
				alias: "recordId",
				dataType: "int"
			});

			// Layout name doesn't conform to Tableau table id requirements
			// filter layout name for id and store original name in alias
			if (!fmConnector.idRegExp.test(tableInfo.id)) {
				var tableId = fmConnector.filterId(tableInfo.id);
				if (tableId.length == 0) {
					tableInfo.id = "table";
				} else {
					tableInfo.id = tableId;
				}
				tableInfo.alias = layout;
			}

			if (conf.incremental && conf.metaData[layout].fieldNames.length > 0) {
				tableInfo.incrementColumnId = "recordId";
			}

			conf.tableInfos.push(tableInfo);

			// save metadata into the configuration for the connection
			tableau.connectionData = JSON.stringify(conf);
		};

		fmConnector.getMetaData = function (successCallback) {
			var conf = JSON.parse(tableau.connectionData);
			var layouts = conf.layouts;

			//Reset table Infos
			conf.tableInfos = [];
			tableau.connectionData = JSON.stringify(conf);

			var promises = [];
			layouts.forEach(function (layout) {

				var promise = fmConnector.filemaker.getMetaData(layout
					, (metaData) => {
						fmConnector.storeMetaData(layout, metaData);
					}
					, (error) => {
						return tableau.abortWithError(lang.errorGetMetaData + " : " + error.message);
					});
				promises.push(promise);
			});
			axios.all(promises).then(function () {
				tableau.connectionName = 'FM: ' + conf.database;
				successCallback()
			});
		};

		fmConnector.FMLogin = function () {
			app.isLoading = true;
			var conf = JSON.parse(tableau.connectionData);
			fmConnector.filemaker.setDatabase(conf.database);
			fmConnector.filemaker.setCredentials(tableau.username, tableau.password);
			fmConnector.filemaker.getToken((token) => {
				conf.token = token;
				tableau.connectionData = JSON.stringify(conf);

				fmConnector.getMetaData(function () {
					app.isLoading = false;
					tableau.submit();
				});
			}, (error) => {
				app.isLoading = false;
				return tableau.abortWithError(lang.errorLoginFailed + ": " + error.message);
			})
		};

		tableau.registerConnector(fmConnector);
	}
)();
