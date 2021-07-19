'use strict';

// Wrap everything in an anonymous function to avoid polluting the global namespace
(function() {

    // app credentials
    const app_id = "<TIMIFY_APP_ID";
    const app_secret = "<TIMIFY_SECRET>";

    // enterprise data
    const enterprise_id = "<ENTERPRISE_ID_TO_QUERY>"

    // Use the jQuery document ready signal to know when everything has been initialized
    $(document).ready(function() {
        // Tell Tableau we'd like to initialize our extension
        tableau.extensions.initializeAsync().then(function() {
            // Fetch the saved sheet name from settings. This will be undefined if there isn't one configured yet
            const savedSheetName = tableau.extensions.settings.get('sheet');
            if (savedSheetName) {
                // We have a saved sheet name, show its selected marks
                loadSelectedMarks(savedSheetName);
            } else {
                // If there isn't a sheet saved in settings, show the dialog
                showChooseSheetDialog();
            }

            initializeButtons();
        });
    });

    /**
     * Shows the choose sheet UI. Once a sheet is selected, the data table for the sheet is shown
     */
    function showChooseSheetDialog() {
        // Clear out the existing list of sheets
        $('#choose_sheet_buttons').empty();

        // Set the dashboard's name in the title
        const dashboardName = tableau.extensions.dashboardContent.dashboard.name;
        $('#choose_sheet_title').text(dashboardName);

        // The first step in choosing a sheet will be asking Tableau what sheets are available
        const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;

        // Next, we loop through all of these worksheets and add buttons for each one
        worksheets.forEach(function(worksheet) {
            // Declare our new button which contains the sheet name
            const button = createButton(worksheet.name);

            // Create an event handler for when this button is clicked
            button.click(function() {
                // Get the worksheet name and save it to settings.
                filteredColumns = [];
                const worksheetName = worksheet.name;
                tableau.extensions.settings.set('sheet', worksheetName);
                tableau.extensions.settings.saveAsync().then(function() {
                    // Once the save has completed, close the dialog and show the data table for this worksheet
                    $('#choose_sheet_dialog').modal('toggle');
                    loadSelectedMarks(worksheetName);
                });
            });

            // Add our button to the list of worksheets to choose from
            $('#choose_sheet_buttons').append(button);
        });

        // Show the dialog
        $('#choose_sheet_dialog').modal('toggle');
    }

    function createButton(buttonTitle) {
        const button =
            $(`<button type='button' class='btn btn-default btn-block'>
      ${buttonTitle}
    </button>`);

        return button;
    }

    // This variable will save off the function we can call to unregister listening to marks-selected events
    let unregisterEventHandlerFunction;

    // Variables to hold data;
    let data;
    let columns;

    function loadSelectedMarks(worksheetName) {
        // Remove any existing event listeners
        if (unregisterEventHandlerFunction) {
            unregisterEventHandlerFunction();
        }

        // Get the worksheet object we want to get the selected marks for
        const worksheet = getSelectedSheet(worksheetName);

        // Set our title to an appropriate value
        $('#selected_marks_title').text(worksheet.name);

        // Call to get the selected marks for our sheet
        worksheet.getSelectedMarksAsync().then(function(marks) {
            // Get the first DataTable for our selected marks (usually there is just one)
            const worksheetData = marks.data[0];

            // Map our data into the format which the data table component expects it
            data = worksheetData.data.map(function(row, index) {
                const rowData = row.map(function(cell) {
                    return cell.formattedValue;
                });

                return rowData;
            });

            columns = worksheetData.columns.map(function(column) {
                return {
                    title: column.fieldName
                };
            });

            // Populate the data table with the rows and columns we just pulled out
            populateDataTable(data, columns);
        });

        // Add an event listener for the selection changed event on this sheet.
        unregisterEventHandlerFunction = worksheet.addEventListener(tableau.TableauEventType.MarkSelectionChanged, function(selectionEvent) {
            // When the selection changes, reload the data
            loadSelectedMarks(worksheetName);
        });
    }

    function populateDataTable(data, columns) {
        // Do some UI setup here: change the visible section and reinitialize the table
        $('#data_table_wrapper').empty();

        if (data.length > 0) {
            $('#no_data_message').css('display', 'none');
            $('#data_table_wrapper').append(`<table id='data_table' class='table table-striped table-bordered'></table>`);

            // Do some math to compute the height we want the data table to be
            var top = $('#data_table_wrapper')[0].getBoundingClientRect().top;
            var height = $(document).height() - top - 130;

            const headerCallback = function(thead, data) {
                const headers = $(thead).find('th');
                for (let i = 0; i < headers.length; i++) {
                    const header = $(headers[i]);
                    if (header.children().length === 0) {
                        const fieldName = header.text();
                        const button = $(`<a href='#'>${fieldName}</a>`);
                        button.click(function() {
                            filterByColumn(i, fieldName);
                        });

                        header.html(button);
                    }
                }
            };

            // Initialize our data table with what we just gathered
            $('#data_table').DataTable({
                data: data,
                columns: columns,
                autoWidth: false,
                deferRender: true,
                scroller: true,
                scrollY: height,
                scrollX: true,
                headerCallback: headerCallback,
                dom: "<'row'<'col-sm-6'i><'col-sm-6'f>><'row'<'col-sm-12'tr>>" // Do some custom styling
            });
        } else {
            // If we didn't get any rows back, there must be no marks selected
            $('#no_data_message').css('display', 'inline');
        }
    }

    function initializeButtons() {
        $('#show_choose_sheet_button').click(showChooseSheetDialog);
        $('#reset_filters_button').click(resetFilters);
        $('#send_to_timify_button').click(sendToTimify);
    }

    // Save the columns we've applied filters to so we can reset them
    let filteredColumns = [];

    function filterByColumn(columnIndex, fieldName) {
        // Grab our column of data from the data table and filter out to just unique values
        const dataTable = $('#data_table').DataTable({
            retrieve: true
        });
        const column = dataTable.column(columnIndex);
        const columnDomain = column.data().toArray().filter(function(value, index, self) {
            return self.indexOf(value) === index;
        });

        const worksheet = getSelectedSheet(tableau.extensions.settings.get('sheet'));
        worksheet.applyFilterAsync(fieldName, columnDomain, tableau.FilterUpdateType.Replace);
        filteredColumns.push(fieldName);
        return false;
    }

    function resetFilters() {
        const worksheet = getSelectedSheet(tableau.extensions.settings.get('sheet'));
        filteredColumns.forEach(function(columnName) {
            worksheet.clearFilterAsync(columnName);
        });

        filteredColumns = [];
    }

    function getSelectedSheet(worksheetName) {
        if (!worksheetName) {
            worksheetName = tableau.extensions.settings.get('sheet');
        }

        // Go through all the worksheets in the dashboard and find the one we want
        return tableau.extensions.dashboardContent.dashboard.worksheets.find(function(sheet) {
            return sheet.name === worksheetName;
        });
    }

    const timify_base_url = "https://api.timify.com/v1";
    const timify_auth_path = "auth/token";

    const timify_auth_url = timify_base_url + "/" + timify_auth_path + "?" + "appid=" + app_id + "&appsecret=" + app_secret;

    const getAccessToken = async () => {
        try {
            const response = await fetch(timify_auth_url);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error("there has been a problem with the retrieval of the access token: ", error.message);
            throw error;
        }
    };

    const headers = (method, accessToken) => {
        return {
            "method": method,
            "headers": {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "authorization": accessToken,
            },
        };
    };

    const getCompanies = async (enterprise_id, accessToken) => {
        // retrieve a list of companies for the specified enterprise id
        try {
            const timify_companies_path = "companies";
            const timify_companies_url = timify_base_url + "/" + timify_companies_path + "?" + "enterprise_id=" + enterprise_id;
            const options = headers("GET", accessToken);
            const response = await fetch(timify_companies_url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error("there has been a problem with the retrieval of the companies information: ", error.message);
            throw error;
        }
    };

    const postFootfallMapping = async (id, accessToken, footfallMapping) => {
        // send the footfall mapping for the store id to Timify
        try {
            const timify_companies_settings_path = `companies/${id}/settings`;
            const timify_companies_settings_url = timify_base_url + "/" + timify_companies_settings_path;
            let options = headers("PUT", accessToken);
            options.body = JSON.stringify({
                "footfall_mapping": footfallMapping,
            });
            const response = await fetch(timify_companies_settings_url, options);
            const json = await response.json();
            return json;
        } catch (error) {
            console.error("there has been a problem with the posting of footfall mappings: ", error.message);
            throw error;
        }
    };

    function padN(num, length) {
        return String(num).padStart(length, "0");
    }

    function convertToDwhConvention(externalId, enterpriseName) {
        // create a HA standardized and unique name for E+M stores
        switch (enterpriseName) {
            case "eyes + more Österreich":
                return "EA" + padN(externalId, 4);
            case "eyes + more Deutschland":
                return "EG" + padN(externalId, 4);
            case "eyes + more België":
                return "EB" + padN(externalId, 4);
            case "eyes + more Nederland":
                return "EN" + padN(externalId, 4);;
            default:
                return externalId;
        }
    }

    const lookupCompanyData = (data, columns, externalId, enterpriseName) => {
        const store = convertToDwhConvention(externalId, enterpriseName);
        let columnIndexDay = columns.findIndex(column => column.title.toUpperCase().indexOf("DAYOFWEEK") > -1);
        let columnIndexHour = columns.findIndex(column => column.title.toUpperCase().indexOf("HOUR") > -1);
        let columnIndexHeatmap = columns.findIndex(column => column.title.toUpperCase().match("HEATMAP.*NAME"));

        // create empty intervals for the store
        let intervals = {
            "found": false,
            "monday": [],
            "tuesday": [],
            "wednesday": [],
            "thursday": [],
            "friday": [],
            "saturday": [],
            "sunday": []
        };

        if (store in data) {
            // go through the data rows of a store
            data[store].rows.forEach((row, index) => {
                const day = row[columnIndexDay];
                const hour = row[columnIndexHour];
                const heatmap = row[columnIndexHeatmap];
                // create an interval record
                const intervalValue = { "begin": padN(hour, 2)+":00", "end": padN(parseInt(hour) + 1, 2)+":00", "footfall": heatmap };
                // depending on the day of the week, append the interval record to the right day array
                switch (parseInt(day)) {
                    case 1:
                        intervals.monday.push(intervalValue);
                        break;
                    case 2:
                        intervals.tuesday.push(intervalValue);
                        break;
                    case 3:
                        intervals.wednesday.push(intervalValue);
                        break;
                    case 4:
                        intervals.thursday.push(intervalValue);
                        break;
                    case 5:
                        intervals.friday.push(intervalValue);
                        break;
                    case 6:
                        intervals.saturday.push(intervalValue);
                        break;
                    case 7:
                        intervals.sunday.push(intervalValue);
                        break;
                    default:
                        throw new Error("invalid day of week received in data");
                }
            });
            // signal we actually found a store
            intervals.found = true;
        }
        return intervals;
    };

    function convertDataToStoreHash(data, columns) {
        let columnIndexStore = columns.findIndex(column => column.title.toUpperCase().startsWith("STORE"));
        let storeHash = {};
        data.forEach((row, index) => {
            const store = row[columnIndexStore];
            if (!(store in storeHash)) {
                storeHash[store] = { "rows": [] };
            }
            storeHash[store].rows.push(row);
        });
        return storeHash;
    }

    // called from click on send_to_timify_button
    function sendToTimify() {
        const storeData = convertDataToStoreHash(data, columns);
        getAccessToken(timify_auth_url).then((response) => {
            console.debug(response);
            const accessToken = response.accessToken;
            getCompanies(enterprise_id, accessToken).then((response) => {
                console.debug(response);
                response.data.forEach((company, index, arrays) => {
                    let intervals = lookupCompanyData(storeData, columns, company.externalId, company.enterprise.name);
                    // get footfallMapping for company external id
                    // intervals: [{ "footfall": "GREEN", "begin": "09:00", "end": "17:00" }]
                    if (intervals.found) {
                        const footfallMapping = [
                                { "isActive": (intervals.monday.lenght == 0 ?    false : true), "intervals": intervals.monday },
                                { "isActive": (intervals.tuesday.lenght == 0 ?   false : true), "intervals": intervals.tuesday },
                                { "isActive": (intervals.wednesday.lenght == 0 ? false : true), "intervals": intervals.wednesday },
                                { "isActive": (intervals.thursday.lenght == 0 ?  false : true), "intervals": intervals.thursday },
                                { "isActive": (intervals.friday.lenght == 0 ?    false : true), "intervals": intervals.friday },
                                { "isActive": (intervals.saturday.lenght == 0 ?  false : true), "intervals": intervals.saturday },
                                { "isActive": (intervals.sunday.lenght == 0 ?    false : true), "intervals": intervals.sunday }
                        ];
                        postFootfallMapping(company.id, accessToken, footfallMapping).then((response) => {
                            console.log(response);
                        });                
                    }
                });
            });
        });   
    }
})();
