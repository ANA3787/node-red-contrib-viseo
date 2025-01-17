"use strict";

const fs = require('fs');
const restify = require('restify');
const builder = require('botbuilder');

let bot;
let verbose = CONFIG.server.verbose;

const route = (callback, options, server) => {
    let opt = options || {};

    // Add GET path for debugging
    server.get('/api/v1/messages/', (req, res, next) => {
        res.send("Hello I'm a Bot !");
        return next();
    });

    // Add ChatBot connector
    let mscfg = {};
    if (opt.appId){
        mscfg.appId       = opt.appId
        mscfg.appPassword = opt.appPassword
    } else if (CONFIG.microsoft){
        mscfg.appId       = CONFIG.microsoft.bot.appId
        mscfg.appPassword = CONFIG.microsoft.bot.appPassword
    }

    let connector = new builder.ChatConnector(mscfg); 
    /*
    connector.getAccessToken((err, accessToken) => {
        console.log('AccessToken',err, accessToken)
    })*/
    
    
    server.post('/api/v1/messages', /*connector.listen()*/ (req, res) => {
        connector.listen()(req, res);
    });
    bot = bindConnector(connector, opt);

    callback(undefined, bot);
};

const bindConnector = exports.bindConnector = (connector, options) => {
    let bot = new builder.UniversalBot(connector, {
        persistUserData: false,
        persistConversationData: false,
        autoBatchDelay: 0,
        storage: new builder.MemoryBotStorage(),
        localizerSettings: {
            botLocalePath: "./locale",
            defaultLocale: options.defaultLocale || "fr_FR"
        }
    });
    
    // Put bot as a global variable
    // global.botbuilder = bot;

    // Anytime the major version is incremented any existing conversations will be restarted.
    bot.use(builder.Middleware.dialogVersion(
        {
            version: 1.0,
            resetCommand: options.resetCommand || /^reset/i
        }
    ));

    // Logging Middleware
    if (verbose) {
        bot.on('incoming', (msg) => { 
            if (!msg.address || !msg.address.serviceUrl) return;
            info("Message incoming:" + JSON.stringify(msg) );
        });
        bot.on('send',     (msg) => { 
            if (!msg.address || !msg.address.serviceUrl) return;
            info("Message outgoing:" + JSON.stringify(msg));
        });
    }
    bot.on('error',    (err) => { console.log("Message error:", err); }) 

    return bot;
}

let server;
const createServer = (callback, options, RED) => {

    let opt = options    || {};
    let srv = opt.port ? opt : CONFIG.server;
    if (!srv || !srv.port){
        if (verbose) info('Missing server configuration, fallback on Node-RED server')
        return callback(undefined, RED.httpNode); 
    }

    // Configure server with credentials if any
    let cfg = {};
    if (srv.certificate){
        cfg.certificate  = fs.readFileSync(srv.certificate.crt);
        cfg.key          = fs.readFileSync(srv.certificate.key);
        
        if (srv.certificate.intermediate)
        cfg.ca           = [fs.readFileSync(srv.certificate.intermediate)];
    }

    // Create server
    server = restify.createServer(cfg);

    // Trap errors
    server.on('error', function(err){
        error(err.message);
        callback(err);
    });

    // Start listening on port
    server.listen(opt.port || CONFIG.server.port, ()  => {
        if (verbose) info('Server "' + server.name + '" listening to ' + server.url);

        // Serve static files
        let root = process.cwd() + '/webapp/';
        if (verbose) info("Serve static files on "+ root);
        server.get(/\/static\/?.*/, restify.serveStatic({
            directory: root,
            default: 'index.html',
            charSet: 'utf-8',
        }));

        callback(undefined, server);
    });
}

exports.start = (callback, options, RED) => {
    createServer((err, server)=>{
        if (err) return callback(err);
        route(callback, options, server)
    }, options, RED)
}

exports.stop  = () => {
    if (undefined == server) return;

    if (verbose) info('Closing HTTP server');
    server.close();
}