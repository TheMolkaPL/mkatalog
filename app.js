var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var fs = require('fs');
var csvParse = require('csv-parse/sync');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//app.use('/', require('./routes/index'));
//app.use('/users', require('./routes/users'));

// catch 404 and forward to error handler
//app.use(function(req, res, next) {
//    next(createError(404));
//});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

app.get('/', function(req, res, next) {
    const search = req.query.search;
    const deep = getBool(req.query.deep, true);
    const merge = getBool(req.query.merge, true);
    const showComments = getBool(req.query.comments, false);
    const showSignatures = getBool(req.query.signatures, false);
    let resources = postReadResources(readCsvResources('../database.csv'), merge);

    let searchValue = '';
    if (search) {
        if (search.startsWith('#')) {
            res.redirect('/' + search.substring(1));
            return;
        }

        searchValue = search;

        const searchQuery = search.split(' ');
        const matchingResources = [];

        resources.forEach(resource => {
            if (matchingResources.includes(resource)) {
                return;
            }

            let ok = true;
            for (let i = 0; i < searchQuery.length; i++) {
                if (!resource.matches(searchQuery[i], { ignoreCase: true }) && (!deep || !resource.insideOfObj || !resource.insideOfObj.matches(searchQuery[i], { ignoreCase: true }))) {
                    ok = false;
                    break;
                }
            }

            if (ok) {
                matchingResources.push(resource);
            }
        });

        resources = matchingResources;
    }

    res.render('index', {
        title: 'Katalog biblioteczny',
        searchValue: searchValue,
        resources: resources,
        showComment: showComments,
        showInsideOf: true,
        showSignature: showSignatures
    });
});

app.get('/:id', function(req, res, next) {
    const id = req.params.id;
    const resources = postReadResources(readCsvResources('../database.csv'), false);

    let result;
    for (let i = 0; i < resources.length; i++) {
        if (resources[i].id == id) {
            result = resources[i];
            break;
        }
    }

    if (!result) {
        next();
        return;
    }

    const insideOfResources = [];
    const duplicateResources = [];
    const similarResources = [];
    resources.forEach(resource => {
        if (resource.id == result.id) {
            return;
        }

        if (resource.insideOfId == result.id || (resource.insideOfObj && resource.insideOfObj.matchesDuplicate(result))) {
            insideOfResources.push(resource);
        } else if (resource.matchesDuplicate(result)) {
            duplicateResources.push(resource);
        } else if (resource.matches(result.title, { ignoreCase: true, strict: ['title'] })) {
            similarResources.push(resource);
        }
    });

    insideOfResources.sort((a, b) => a.compareTo(b));
    duplicateResources.sort((a, b) => a.compareTo(b));
    similarResources.sort((a, b) => a.compareTo(b));

    res.render('resource', {
        title: result.title,
        searchValue: '',
        resource: result,
        insideOfResources: insideOfResources,
        duplicateResources: duplicateResources,
        similarResources: similarResources
    });
});

app.get('*', function(req, res, next) {
    res.status(404).render('error', {
        title: '404',
        searchValue: '',
        message: '404',
        error: {
            status: ''
        }
    });
});

function getBool(input, def) {
    if (typeof input == 'undefined') {
        return def;
    } else if (input == '1') {
        return true;
    } else if (input == '0') {
        return false;
    }
    return input;
}

class Resource {
    constructor(id, title, type, authors, year, number, insideOfId, publisher, comment, icon) {
        this.id = id;
        this.title = title;
        this.type = type;
        this.authors = authors;
        this.year = year;
        this.number = number;
        this.insideOfId = insideOfId;
        this.publisher = publisher;
        this.comment = comment;
        this.icon = icon;
        this.insideOfResourcesCount = 0;
        this.foreignInsideOfResourcesCount = 0;
    }

    compareTo(obj) {
        var compare;

        compare = this.title.toString().localeCompare(obj.title, undefined, { numeric: true });
        if (compare != 0) {
            return compare;
        }

        if (this.year) {
            compare = this.year.toString().localeCompare(obj.year, undefined, { numeric: true });
            if (compare != 0) {
                return compare;
            }
        }

        if (this.number) {
            compare = this.number.toString().localeCompare(obj.number, undefined, { numeric: true });
            if (compare != 0) {
                return compare;
            }
        }

        return 0;
    }

    matches(query, options) {
        return this.matches0(query, options, {
            'id': this.id,
            'title': this.title,
            'type': this.type,
            'author': this.authors,
            'year': this.year,
            'number': this.number,
            'insideOf': this.insideOfId,
            'publisher': this.publisher,
            'comment': this.comment
        });
    }

    matchesDuplicate(otherResource) {
        if (this.id == otherResource.id) {
            return false;
        }
        return this.type == otherResource.type &&
                this.title == otherResource.title &&
                JSON.stringify(this.year) == JSON.stringify(otherResource.year) && // ugh...
                this.number == otherResource.number;
    }

    matches0(query, options, params) {
        if (!options) {
            options = {};
        }

        query = query.toString().trim();
        if (options.ignoreCase) {
            query = query.toLowerCase();
        }

        for (var key in params) {
            if (!params[key]) {
                continue;
            }

            let value = params[key].toString().trim();
            if (options.ignoreCase) {
                value = value.toLowerCase();
            }

            if (query.includes(':')) {
                const split = query.split(':');
                if (split[0] in params) {
                    if (split[0] !== key) {
                        continue;
                    }
                    query = split[1].trim();
                }
            }

            if (options.strict && options.strict.includes(key)) {
                return value === query;
            } else if (value.includes(query)) {
                return true;
            }
        }

        return false;
    }
}

class Multi extends Resource {
    constructor(resources, icon) {
        let master;
        for (let i = 0; i < resources.length; i++) {
            if (!master || master.id > resources[i].id) {
                master = resources[i];
            }
        }

        let authors;
        for (let i = 0; i < resources.length; i++) {
            let targetAuthors = resources[i].authors;

            if (targetAuthors) {
                if (authors) {
                    for (let i0 = 0; i0 < targetAuthors.length; i0++) {
                        if (!authors.includes(targetAuthors[i0])) {
                            authors.push(targetAuthors[i0]);
                        }
                    }
                    authors.sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { numeric: true }));
                } else {
                    authors = targetAuthors;
                }
            }
        }

        let year;
        for (let i = 0; i < resources.length; i++) {
            let targetYear = resources[i].year;

            if (targetYear) {
                targetYear = targetYear.toString().trim();
                if (!year) {
                    year = [targetYear];
                } else if (year && !year.includes(targetYear)) {
                    year.push(targetYear);
                    year.sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { numeric: true }));
                }
            }
        }

        if (!icon) {
            icon = master.icon;
        }

        super(master.id, master.title, master.type, master.authors, year, undefined, undefined, master.publisher, undefined, icon);
        this.resources = resources;

        let insideOfResourcesCount = 0;
        for (let i = 0; i < resources.length; i++) {
            insideOfResourcesCount += resources[i].insideOfResourcesCount;
        }
        super.insideOfResourcesCount = insideOfResourcesCount;
    }

    matches(query, options) {
        for (let i = 0; i < this.resources.length; i++) {
            if (this.resources[i].matches(query, options)) {
                return true;
            }
        }

        return false;
    }
}

function readCsvResources(path) {
    const input = fs.readFileSync(path, { encoding: 'utf8' });
    const records = csvParse.parse(input, { delimiter: ',' });

    const resources = [];
    for (let i = 0; i < records.length; i++) {
        if (i == 0) { // header row
            continue;
        }

        const record = records[i];
        const id = i + 1;
        const titleInput = read(record[0]);
        const authorsInput = read(record[1])
        const publisherInput = read(record[2]);
        const yearInput = read(record[3]);
        const numberInput = read(record[4]);
        const insideOfIdInput = read(record[5]);
        const typeInput = read(record[6]);
        const commentInput = read(record[7]);

        if (record[8].toString() == 'brak') {
            continue;
        }

        if (!titleInput) {
            continue;
        }

        let authors;
        if (authorsInput) {
            authors = authorsInput.split(';');
            for (let i = 0; i < authors.length; i++) {
                authors[i] = authors[i].trim();
            }
            authors.sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { numeric: true }));
        }

        let year;
        if (yearInput) {
            year = [yearInput.toString().trim()];
        }

        let icon = 'bi bi-file-text';
        switch (typeInput) {
            case 'album':
                icon = 'bi bi-images';
                break;
            case 'książka':
                icon = 'bi bi-book';
                break;
            case 'czasopismo':
            case 'gazeta':
                icon = 'bi bi-newspaper';
                break;
            case 'artykuł':
            case 'rozdział':
            case 'rozdział książki':
            case 'rozprawa doktorska':
                icon = 'bi bi-file-text';
                break;
            case 'folder':
                icon = 'bi bi-folder';
                break;
            case 'mapa':
                icon = 'bi bi-map';
                break;
            case 'maszynopis':
                icon = 'bi bi-file-binary';
                break;
            case 'medal':
            case 'przypinka':
                icon = 'bi bi-award';
                break;
            case 'pocztówka':
                icon = 'bi bi-postcard';
                break;
            case 'zdjęcie':
                icon = 'bi bi-image';
                break;
        }

        resources.push(new Resource(id, titleInput, typeInput, authors, year, numberInput, insideOfIdInput, publisherInput, commentInput, icon));
    }

    return resources;
}

function read(param) {
    if (typeof param === 'undefined') {
        return undefined;
    } else if (param === '') {
        return undefined;
    }

    return param;
}

function postReadResources(resources, merge) {
    // hook insideOfObj relations
    for (let i = 0; i < resources.length; i++) {
        const resource = resources[i];
        if (!resource.insideOfId) {
            continue;
        }

        for (let i0 = 0; i0 < resources.length; i0++) {
            if (resource.insideOfId == resources[i0].id) {
                resource.insideOfObj = resources[i0];
                resource.insideOfObj.insideOfResourcesCount++;
                break;
            }
        }
    }

    // copy foreign duplicated insideOfResourcesCount
    for (let i = 0; i < resources.length; i++) {
        const resource = resources[i];
        resource.foreignInsideOfResourcesCount = 0;

        for (let i0 = 0; i0 < resources.length; i0++) {
            const otherResource = resources[i0];

            if (resource.matchesDuplicate(otherResource)) {
                resource.foreignInsideOfResourcesCount += otherResource.insideOfResourcesCount;
            }
        }
    }

    // merge similar to multi
    const results = [];
    mainLoop: for (let i = 0; i < resources.length; i++) {
        const resource = resources[i];

        for (let i0 = 0; i0 < results.length; i0++) {
            if (results[i0].resources && results[i0].resources.includes(resource)) {
                continue mainLoop;
            }
        }

        const multi = [resource];
        for (let i0 = 0; i0 < resources.length; i0++) {
            const targetResource = resources[i0];
            if (!multi.includes(targetResource) && resource.id != targetResource.id && resource.title == targetResource.title && resource.type == targetResource.type) {
                multi.push(targetResource);
            }
        }

        if (merge && multi.length > 1) {
            results.push(new Multi(multi));
        } else {
            results.push(resource);
        }
    }

    results.sort((a, b) => a.compareTo(b));
    return results;
}

module.exports = app;
