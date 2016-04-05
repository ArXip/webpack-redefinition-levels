var path = require( 'path' ),
    fs = require( 'fs' ),
    assign = require( 'object-assign' )

var REGEXP_ESCAPE_RANGE = /([^\w\d])/g

function RedefinitionLevelsPlugin( base ) {
    if( Array.prototype.some.call( arguments, function( arg ) {
        return typeof arg !== 'string' && typeof arg !== 'boolean'
    } ) )
        throw new TypeError( '[webpack-redefinition-levels] Base path and levels must be a string.')
        
    if( arguments.length < 2 || ( arguments.length === 2 && typeof arguments[ 1 ] === 'boolean' ) )
        throw new TypeError( '[webpack-redefinition-levels] Invalid signature. At least one level argument is required.' )
        
    if( !path.isAbsolute( base ) )
        throw new Error( '[webpack-redefinition-levels] Base path must be absolute.' )
    
    this.base = base
    this.forceRedefinition = false;
    
    var levels = Array.prototype.filter
        .call( arguments, function( arg ) {
            if( typeof arg === 'string' )
                return true;
            
            this.forceRedefinition = arg
            return false;
        }, this )
        .map( function( level ) {
            if( path.isAbsolute( level ) )
                return level;

            return path.resolve( base, level )
        } )
    
    this.levels = levels
    
    if( this.forceRedefinition ) {
//         /^(?:base|level\.1|…)
        this.pathRegexp = new RegExp(
            '^(?:' +
            levels.map( function( level ) {
                return level.replace( REGEXP_ESCAPE_RANGE, '\\$1' )
            } ).join( '|' ) +
            ')'
        )
    } else {
        this.pathRegexp = new RegExp( '^' + base.replace( REGEXP_ESCAPE_RANGE, '\\$1' ) )
    }
}

RedefinitionLevelsPlugin.prototype.apply = function( compiler ) {
    assign( this, {
        extensions: compiler.options.extensions || this.extensions || [ '.js', '.json', '.node' ]
    } )
    
    compiler.resolvers.normal.apply( new ResolverPlugin( this ) )
}

module.exports = RedefinitionLevelsPlugin

function ResolverPlugin( options ) {
    assign( this, options )
}

ResolverPlugin.canResolveModule = function( pathTo, extensions ) {
    var pathParsed = path.parse( pathTo )
    if( pathParsed.ext ) {
        extensions = [ pathParsed.ext ]
        pathTo = path.join( pathParsed.dir, pathParsed.name )
    }
    
    for( var i = 0, l = extensions.length; i < l; i++ ) {
        try {
            fs.accessSync( pathTo + extensions[ i ] )
            
            return true;
        } catch( e ) {}
    }
    
    return false;
}

ResolverPlugin.prototype.apply = function( resolver ) {
    var self = this
    
    resolver.plugin( "resolve", function( context, request ) {
//        Dont touch modules like node_modules
        if( request.path[0] !== '.' || request.module )
            return;

//        Module placed outside the base and levels folders
        if( !self.pathRegexp.test( context ) )
            return;

//        Tries to find required component in current project dir
        if( !self.forceRedefinition && ResolverPlugin.canResolveModule( 
            path.join( context, request.path ),
            self.extensions
        ) )
            return;
        
        self.levels.some( function( level ) {
            
//            Creates relative path to same folder in fallback project dir
            var relative = path.relative(
                context,
                context.replace( self.pathRegexp, level )
            )

//            Ignore when cant conctruct relatibe path to fallback project dir
//            But when forceRedefinition is true and context folder inside base folder,
//            we'll try to find module by its original path (now request.path === newPath)
            if( !relative && !self.forceRedefinition ) {
                return true;
            }
            
//            Creates new relative path
            var newPath = path.join(
                relative,
                request.path
            )
            
            if( ResolverPlugin.canResolveModule(
                path.join( context, newPath ),
                self.extensions
            ) ) {
                request.path = newPath
                return true;
            }
        } )
    } );
}
