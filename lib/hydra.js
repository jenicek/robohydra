var HydraHead = require('./hydraHead.js').HydraHead,
    HydraHeadStatic = require('./hydraHead.js').HydraHeadStatic,
    HydraHeadFilesystem = require('./hydraHead.js').HydraHeadFilesystem,
    HydraHeadProxy = require('./hydraHead.js').HydraHeadProxy;

var InvalidHydraPluginException = function(message) {
    this.name    = "InvalidHydraPluginException";
    this.message = message || 'Invalid or incomplete plugin';
};
InvalidHydraPluginException.prototype.toString = function() {
    return "InvalidHydraPluginException";
};

var DuplicateHydraPluginException = function(message) {
    this.name    = "DuplicateHydraPluginException";
    this.message = message || 'Duplicate or incomplete plugin';
};
DuplicateHydraPluginException.prototype.toString = function() {
    return "DuplicateHydraPluginException";
};

var DuplicateHydraHeadNameException = function(head) {
    this.name    = "DuplicateHydraHeadNameException";
    this.message = 'Duplicate Hydra head name "' + head + '"';
};
DuplicateHydraHeadNameException.prototype.toString = function() {
    return "DuplicateHydraHeadNameException";
};

var HydraHeadNotFoundException = function(pluginName, headName) {
    this.name    = "HydraHeadNotFoundException";
    this.message = 'Could not find the given head ("' + pluginName +
            '" / "' + headName + '")';
};
HydraHeadNotFoundException.prototype.toString = function() {
    return "HydraHeadNotFoundException";
};

var Hydra = function() {
    this._plugins = [];
    this._headMap = {};
    this._count = 0;
};
Hydra.prototype._validatePluginName = function(pluginName) {
    return (typeof(pluginName) === 'string' &&
                pluginName.match(new RegExp('^[a-z0-9_]+$', 'i')));
};
Hydra.prototype.registerPlugin = function(plugin) {
    if (! this._validatePluginName(plugin.name) ||
            typeof(plugin.heads) === 'undefined' || !plugin.heads.length)
        throw new InvalidHydraPluginException();

    var name = plugin.name;
    if (this._plugins.some(function(v) { return v.plugin.name === name; })) {
        throw new DuplicateHydraPluginException();
    }

    var self = this;
    var anonymousHeadCount = 0;
    var headMap = {};
    plugin.heads.forEach(function(head) {
        // Calculate head name if not specified
        var headName = head.name();
        if (typeof(headName) === 'undefined') {
            headName = 'anonymousHydraHead' + anonymousHeadCount;
            anonymousHeadCount++;
        }

        if (headMap.hasOwnProperty(headName)) {
            throw new DuplicateHydraHeadNameException(headName);
        }
        headMap[headName] = head;
    });
    this._plugins.push({headMap: headMap, plugin: plugin});
};
Hydra.prototype.pluginNames = function() {
    return this._plugins.map(function(v) { return v.plugin.name; });
};
Hydra.prototype.handle = function(req, res, cb) {
    var handled = false;
    outerloop:
    for (var i = 0, len = this._plugins.length; i < len; i++) {
        var plugin = this._plugins[i].plugin;
        for (var j = 0, len2 = plugin.heads.length; j < len2; j++) {
            if (plugin.heads[j].canDispatch(req.url)) {
                res.statusCode = 200;
                plugin.heads[j].handle(req, res, cb);
                handled = true;
                break outerloop;
            }
        }
    }
    if (! handled) {
        res.statusCode = 404;
        res.send("Not Found");
    }
};
Hydra.prototype.findHead = function(pluginName, headName) {
    for (var i = 0, len = this._plugins.length; i < len; i++) {
        if (this._plugins[i].plugin.name === pluginName) {
            var head = this._plugins[i].headMap[headName];
            if (typeof(head) === 'undefined') {
                throw new HydraHeadNotFoundException(pluginName, headName);
            } else {
                return head;
            }
        }
    }
    throw new HydraHeadNotFoundException(pluginName, headName);
};
Hydra.prototype.detachHead = function(pluginName, headName) {
    this.findHead(pluginName, headName).detach();
};
Hydra.prototype.attachHead = function(pluginName, headName) {
    this.findHead(pluginName, headName).attach();
};

function headTypeToConstructor(headType) {
    var headTypeMap = {
        'generic': HydraHead,
        'static': HydraHeadStatic,
        'filesystem': HydraHeadFilesystem,
        'proxy': HydraHeadProxy
    };
    return headTypeMap[headType];
}

function summonHydraBodyParts(bodyPartDefinition) {
    if (typeof(bodyPartDefinition.heads) === 'undefined') {
        throw new InvalidHydraPluginException();
    } else {
        var bodyParts = {};
        bodyParts.heads =
            bodyPartDefinition.heads.map(function(part) {
                var params = {};
                for (var i in part) {
                    if (part.hasOwnProperty(i)) params[i] = part[i];
                }

                var constructorFunction = headTypeToConstructor(part.type);
                if (typeof(constructorFunction) === 'function') {
                    return new constructorFunction(params);
                } else {
                    throw new InvalidHydraPluginException("Unknown head type '" + part.type + "'");
                }
            });
        return bodyParts;
    }
}

exports.Hydra                = Hydra;
exports.summonHydraBodyParts = summonHydraBodyParts;