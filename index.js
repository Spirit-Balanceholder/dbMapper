const mysql = require('mysql')
const config = require('./config.json')
const fs = require('fs');

let db = mysql.createConnection(config.mysql)
let del = db._protocol._delegateError;
db._protocol._delegateError = function(err, sequence){
    if (err.fatal) {
        console.trace('DEL','fatal error: ' + err.message);
    }
    return del.call(this, err, sequence);
};


function query(queryString) {
    return new Promise((resolve, reject) => {
        db.query(queryString, (error, results) => {
            (error) ? reject(error) : resolve(results)
        })
    })
}

let dbMap = {}
query(`
SELECT DISTINCT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '${config.mysql.database}'
`).then(async (val) => {
    for (let i = 0; i < val.length; i++) {
        const table = val[i].TABLE_NAME;

        dbMap[table] = {}

        await query(`
        SELECT DISTINCT 
		    COLUMNS.COLUMN_NAME as 'name',
		    COLUMNS.DATA_TYPE as 'type',
		    COLUMNS.IS_NULLABLE as 'nullable',
		    COLUMNS.CHARACTER_MAXIMUM_LENGTH as 'maxLength',
		    COLUMNS.EXTRA as 'extra',
		  	CASE WHEN COLUMNS.COLUMN_NAME IN (
			  	SELECT
					KEY_COLUMN_USAGE.COLUMN_NAME
				FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
				LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE
					ON KEY_COLUMN_USAGE.TABLE_SCHEMA = TABLE_CONSTRAINTS.TABLE_SCHEMA
						AND KEY_COLUMN_USAGE.TABLE_NAME = TABLE_CONSTRAINTS.TABLE_NAME
						AND KEY_COLUMN_USAGE.CONSTRAINT_NAME = TABLE_CONSTRAINTS.CONSTRAINT_NAME
				WHERE TABLE_CONSTRAINTS.TABLE_SCHEMA = '${config.mysql.database}'
					AND TABLE_CONSTRAINTS.CONSTRAINT_TYPE = 'PRIMARY KEY'
					AND KEY_COLUMN_USAGE.TABLE_NAME = '${table}'
			) THEN TRUE ELSE NULL END AS isPrimaryKey
		FROM INFORMATION_SCHEMA.TABLES
		LEFT JOIN INFORMATION_SCHEMA.COLUMNS ON
			COLUMNS.TABLE_SCHEMA = TABLES.TABLE_SCHEMA AND
			COLUMNS.TABLE_NAME = TABLES.TABLE_NAME
		WHERE TABLES.TABLE_NAME = '${table}'
			AND COLUMNS.TABLE_SCHEMA = '${config.mysql.database}'
        `).then (columns => {
            for (let ci = 0; ci < columns.length; ci++) {
                const column = columns[ci];
                
                dbMap[table][column.name] = {
                    datatype: column.type,
                    nullable: column.nullable,
                    maxLength: column.maxLength,
                    extra: column.extra,
                    isPrimaryKey: column.isPrimaryKey
                }
            }
        })
    }    
}).then(() => {
    fs.writeFileSync("./dbMap.json", JSON.stringify(dbMap));
    process.exit();
})
