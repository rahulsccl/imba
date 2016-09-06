(function(){
	function iter$(a){ return a ? (a.toArray ? a.toArray() : a) : []; };
	var helpers = require("../compiler/helpers");
	var compiler = require("../compiler/compiler");
	
	var path = require("path");
	var fs = require("fs");
	var stdin = process.stdin;
	var stdout = process.stdout;
	var ansi = helpers.ansi;
	var package = require('../../package.json');
	
	var parseOpts = {
		alias: {
			o: 'output',
			h: 'help',
			s: 'stdio',
			b: 'bare',
			p: 'print',
			m: 'sourceMap',
			a: 'analyze',
			t: 'tokenize',
			v: 'version'
		},
		
		schema: {
			output: {type: 'string'},
			target: {type: 'string'}
		},
		
		group: ['source-map']
	};
	
	
	var help = "\nUsage: imbac [options] path/to/script.imba\n\n  -a, --analyze          print out the scopes and variables of your script\n  -b, --bare             compile without a top-level function wrapper\n  -h, --help             display this help message\n  -m, --source-map       generate source map and add inline to .js files\n  -o, --output [dir]     set the output directory for compiled JavaScript\n  -p, --print            print out the compiled JavaScript\n  -s, --stdio            listen for and compile scripts over stdio\n  -t, --tokenize         print out the tokens that the lexer/rewriter produce\n      --target [target]  explicitly compile for node/web/webworker\n  -v, --version          display the version number\n";
	
	function ensureDir(src){
		if (fs.existsSync(src)) { return true };
		var parts = path.normalize(src).split(path.sep);
		for (var i = 0, ary = iter$(parts), len = ary.length; i < len; i++) {
			if (i < 1) { continue; };
			// what about relative paths here? no good? might be important for symlinks etc no?
			var dir = parts.slice(0,i + 1).join(path.sep);
			
			if (fs.existsSync(dir)) {
				var stat = fs.statSync(dir);
			} else if (ary[i].match(/\.(imba|js)$/)) {
				true;
			} else {
				fs.mkdirSync(dir);
				console.log(ansi.green(("+ mkdir " + dir)));
			};
		};
		return;
	};
	
	function findRecursive(root,pattern){
		if(pattern === undefined) pattern = /\.imba$/;
		var results = [];
		root = path.relative(process.cwd(),root);
		root = path.normalize(root);
		
		var read = function(src,depth) {
			src = path.normalize(src);
			var stat = fs.statSync(src);
			
			if (stat.isDirectory() && depth > 0) {
				var files = fs.readdirSync(src);
				for (var i = 0, ary = iter$(files), len = ary.length, res = []; i < len; i++) {
					res.push(read(src + '/' + ary[i],depth - 1));
				};
				return res;
			} else if (src.match(pattern)) {
				return results.push(src);
			};
		};
		
		if (root.match(/\/\*\.imba$/)) {
			root = root.slice(0,-7);
			read(root,1);
		} else {
			read(root,10);
		};
		
		return results;
	};
	
	function pathToSource(src,coll,o,root){
		if(root === undefined) root = null;
		var abs = path.resolve(process.cwd(),src);
		var stat = fs.statSync(abs);
		
		if (stat.isDirectory()) {
			// console.log "is directory",findRecursive(abs)
			var files = findRecursive(abs);
			for (var i = 0, ary = iter$(files), len = ary.length; i < len; i++) {
				pathToSource(ary[i],coll,o,abs);
			};
			return;
		};
		
		var file = {
			filename: path.basename(src),
			sourcePath: abs,
			sourceBody: fs.readFileSync(abs,'utf8')
		};
		
		if (o.output) {
			var rel = root ? (path.relative(root,abs)) : (file.filename);
			file.targetPath = path.resolve(o.output,rel);
		} else if (!o.print && !o.stdio) {
			file.targetPath = file.sourcePath;
		};
		
		if (file.targetPath) {
			file.targetPath = file.targetPath.replace(/\.imba$/,'.js');
		};
		
		return coll.push(file);
	};
	
	
	function CLI(options){
		if(options === undefined) options = {};
		this._options = options;
		this._sources = [];
		this._current = null;
		this;
	};
	
	CLI.prototype.sources = function(v){ return this._sources; }
	CLI.prototype.setSources = function(v){ this._sources = v; return this; };
	
	CLI.prototype.cwd = function (){
		return process.cwd();
	};
	
	CLI.prototype.run = function (){
		var self = this, o_, main_;
		(o_ = self.o()).target || (o_.target = 'node');
		
		if (self.o().output) {
			self.o().output = path.normalize(path.resolve(self.cwd(),self.o().output));
		};
		
		var paths = (typeof (main_ = self.o().main)=='string'||main_ instanceof String) ? ([self.o().main]) : ((self.o().main || []));
		for (var i = 0, ary = iter$(paths), len = ary.length; i < len; i++) {
			pathToSource(ary[i],self._sources,self._options);
		};
		
		if (self.o().stdio) {
			if (!self.o().output) { self.o().print = true };
			var chunks = [];
			stdin.resume();
			stdin.setEncoding('utf8');
			stdin.on('data',function(chunk) { return chunks.push(chunk); });
			stdin.on('end',function() {
				self.sources().push({filename: 'stdin',sourceBody: chunks.join()});
				return self.finish();
			});
		} else {
			self.finish();
		};
		return self;
	};
	
	CLI.prototype.o = function (){
		return this._options;
	};
	
	CLI.prototype.traverse = function (cb){
		for (var i = 0, ary = iter$(this.sources()), len = ary.length, src; i < len; i++) {
			src = ary[i];
			this._current = src;
			cb(src);
		};
		return this;
	};
	
	CLI.prototype.log = function (message){
		if (!this.o().print) { console.log(message) };
		return this;
	};
	
	CLI.prototype.b = function (text){
		return this.o().colors ? (ansi.bold(text)) : (text);
	};
	
	CLI.prototype.rel = function (src){
		src = src.sourcePath || src;
		return path.relative(process.cwd(),src);
	};
	
	CLI.prototype.present = function (data,o){
		if (o.print) {
			process.stdout.write(data);
		};
		return this;
	};
	
	CLI.prototype.analyze = function (){
		var self = this;
		return self.traverse(function(src) {
			var o2 = Object.create(self.o());
			o2.filename = src.filename;
			var out = compiler.analyze(src.sourceBody,o2);
			src.analysis = out;
			return self.present(JSON.stringify(out),self.o());
		});
	};
	
	CLI.prototype.tokenize = function (){
		// should prettyprint tikens
		var self = this;
		return self.traverse(function(src) {
			var o2 = Object.create(self.o());
			o2.filename = src.filename;
			var out = compiler.tokenize(src.sourceBody,o2);
			src.tokens = out;
			return self.present(JSON.stringify(out),self.o());
		});
	};
	
	CLI.prototype.compile = function (){
		var self = this;
		return self.traverse(function(src) {
			var o2 = Object.create(self.o());
			o2.filename = src.filename;
			var out = compiler.compile(src.sourceBody,o2);
			// optionally add sourcemap
			if (self.o().sourceMap && out.sourcemap) {
				var base64 = new Buffer(JSON.stringify(out.sourcemap)).toString("base64");
				out.js = out.js + "\n//# sourceMappingURL=data:application/json;base64," + base64;
			};
			
			src.output = out;
			
			if (src.targetPath) {
				ensureDir(src.targetPath);
				fs.writeFileSync(src.targetPath,out.js,'utf8');
				var srcp = path.relative(process.cwd(),src.sourcePath);
				var dstp = path.relative(process.cwd(),src.targetPath);
				self.log(ansi.gray("compile") + (" " + self.b(srcp) + " to " + self.b(dstp)));
			};
			
			return self.present(out.js,self.o());
		});
	};
	
	CLI.prototype.finish = function (){
		try {
			if (this.o().analyze) {
				this.o().print = true;
				this.analyze(this.sources(),this.o());
			} else if (this.o().tokenize) {
				this.o().print = true;
				this.tokenize(this.sources(),this.o());
			} else {
				this.compile(this.sources(),this.o());
			};
		} catch (e) {
			if (this._current) {
				this.log(("ERROR in " + this.b(this.rel(this._current))));
			};
			if (e.excerpt) {
				this.log(e.excerpt({colors: true}));
			} else {
				throw e;
			};
		};
		return this;
	};
	
	
	function run(){
		var o = helpers.parseArgs(process.argv.slice(2),parseOpts);
		
		if (o.version) {
			return console.log(package.version);
		} else if (!o.main || o.help) {
			return console.log(help);
		} else {
			return new CLI(o).run();
		};
	}; exports.run = run;; return run;

})();