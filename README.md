# FileMaker 2 Tableau
This is an easy to use FileMaker® Web Data Connector built for Tableau 10.4+  
Unlike Claris' offical connector, it allows you to connect multiple layouts at once, with an easy to use UI including autocompletion for databases and layouts.  
It's totally free and open source !

![Screenshot](https://www.1-more-thing.com/wp-content/uploads/2020/03/FileMaker_2_Tableau.png)

## Features
* Auto Discover available databases using provided credentials
* Auto Discover available Layouts in the selected database
* Select multiple layouts to import in your Tableau Data Source

## Installation
Unzip or clone this project in a subdirectory of your FileMaker server web root

Windows :  
C:/program Files/FileMaker/FileMaker Server/HTTPServer/conf

MacOs:  
/Library/FileMaker Server/HTTPServer/htdocs/httpsRoot

Access the connector in tableau using your server's dns and the name of the folder where you saved the connector.  
IE : https://<your_server_address>/<my_folder>

### Important notice
* Because of CORS restriction this connector must be installed on the same machine where FileMaker server is running
* You must enable FileMaker server Data API
* Refer to FileMaker's documentation to configure access to your database through the data API
* Oauth is not yet supported be will be added shortly

### Security concerns
* Avoid allowing access to data API using guest account
* Enable "Filter Databases" option in your FileMaker server config to prevent available databases names to be exposed without providing valid credentials
