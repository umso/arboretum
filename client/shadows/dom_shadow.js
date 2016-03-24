//NO, this has nothing to do with *that* shadow dom
var _ = require('underscore'),
	util = require('util'),
	EventEmitter = require('events'),
	NODE_CODE = require('../../utils/node_code');
var log = require('../../utils/logging').getColoredLogger('magenta', 'bgBlack');

var DOMTreePlaceholder = function(tree) {
	this.tree = tree;
	this._id = tree.getId();
};
(function(My) {
	var proto = My.prototype;
	proto.getId = function() {
		return this._id;
	};
	proto.destroy = function() { };
}(DOMTreePlaceholder));

var ShadowDOM = function(options) {
	this.options = _.extend({
		tree: false,
		state: false,
		socket: false,
		childMapFunction: function(child) {
			var shadow = new ShadowDOM({
				tree: child,
				state: this._getState(),
				socket: this._getSocket()
			});
			return shadow;
		},
		childFilterFunction: function(child) {
			var node = child._getNode(),
				nodeName = node.nodeName,
				nodeType = node.nodeType;
			if(/*nodeName === 'STYLE' || */nodeName === 'SCRIPT' ||
				nodeName === '#comment'/* || nodeName === 'LINK'*/ ||
				nodeName === 'BASE' || nodeType === NODE_CODE.DOCUMENT_TYPE_NODE) {
				return false;
			} else {
				return true;
			}
		}
	}, options);

	if(!this.options.tree) {
		throw new Error('No Tree');
	}

	this._attributes = {};
	this._inlineCSS = '';

	log.debug('::: CREATED DOM SHADOW ' + this.getTree().getId() + ' :::');
	this._initialize();
};

(function(My) {
	util.inherits(My, EventEmitter);
	var proto = My.prototype;

	proto._childAdded = function(info) {
		var child = info.child,
			previousNode = info.previousNode,
			toAdd,
			addedAtIndex;

		var tree = this.getTree();

		return tree._children_initialized.then(_.bind(function() {
			log.debug('children updated ' + tree.getId());
			if(this.options.childFilterFunction.call(this, child)) {
				toAdd = this.options.childMapFunction.call(this, child);
			} else {
				toAdd = new DOMTreePlaceholder(child);
			}

			if(previousNode) {
				var previousNodeId = previousNode.getId(),
					myChildren = this.children,
					len = myChildren.length,
					i = 0,
					child;

				while(i < len) {
					child = myChildren[i];
					if(child.getId() === previousNodeId) {
						this.children.splice(i+1, 0, toAdd);
						addedAtIndex = i+1;
						break;
					}
					i++;
				}
			} else {
				this.children.unshift(toAdd);
				addedAtIndex = 0;
			}

			if(toAdd instanceof My) {
				var state = this._getState(),
					previousNodeId = false,
					node;
				for(var i = addedAtIndex-1; i>=0; i--) {
					node = this.children[i];
					if(node instanceof My) {
						previousNodeId = node.getId();
						break;
					}
				}
				var socket = this._getSocket();
				log.debug('Child ' + child.getId() + ' added to ' + parent.getId());
				socket.emit('childAdded', {
					parentId: this.getId(),
					child: toAdd.serialize(),
					previousChild: previousNodeId
				});
			}
		}, this)).catch(function(err) {
			log.error(err);
		});
	};

	proto._getState = function() {
		return this.options.state;
	};

	proto._childRemoved = function(info) {
		var removedChild = info.child,
			removedChildId = removedChild.getId(),
			myChildren = this.children,
			len = myChildren.length,
			i = 0,
			child,
			wasRemoved;

		while(i < len) {
			child = myChildren[i];
			if(child.getId() === removedChildId) {
				wasRemoved = child;
				this.children.splice(i, 1);
				break;
			}
			i++;
		}

		if(wasRemoved) {
			if(wasRemoved instanceof My) {
				var socket = this._getSocket();
				log.debug('Child ' + wasRemoved.getId() + ' removed  from ' + this.getId());
				socket.emit('childRemoved', {
					parentId: this.getId(),
					childId: wasRemoved.getId()
				});
			}
			wasRemoved.destroy();
		}
	};

	proto._childrenChanged = function(info) {
		var children = info.children;
		this._updateChildren(children).then(_.bind(function() {
			var socket = this._getSocket();
			log.debug('Children changed ' + this.getId());
			socket.emit('childrenChanged', {
				parentId: this.getId(),
				children: this.getChildren().map(function(child) { return child.serialize(); })
			});
		}, this)).catch(function(e) {
			log.error(e.stack);
		});
	};

	proto._nodeValueChanged = function(info) {
		this._value = info.value;

		var socket = this._getSocket();

		log.debug('Value changed ' + this.getId());
		socket.emit('valueChanged', {
			id: this.getId(),
			value: this._value
		});
	};

	proto._updateChildren = function(treeChildren) {
		this.children = _	.chain(treeChildren)
							.map(function(child) {
								var toAdd;
								if(this.options.childFilterFunction.call(this, child)) {
									toAdd = this.options.childMapFunction.call(this, child);
								} else {
									toAdd = new DOMTreePlaceholder(child);
								}
								return toAdd;
							}, this)
							.value();
							/*
		var tree = this.getTree();
		return tree._children_initialized.then(_.bind(function() {
			log.debug('Children initialized ' + tree.getId());
		}, this)).catch(function(err) {
			console.error(err);
		});
		*/
	};

	proto.getTree = function() {
		return this.options.tree;
	};

	proto.getNode = function() {
		var tree = this.getTree();
		var node = tree._getNode();
		return node;
	};


	proto.getChildren = function() {
		return _.filter(this.children, function(child) {
			return child instanceof My;
		});
	};

	proto.serialize = function() {
		var tree = this.getTree(),
			node = tree._getNode();

		return {
			id: this._id,
			type: this._type,
			name: this._name,
			value: this._value,
			children: _.map(this.getChildren(), function(child) {
				return child.serialize();
			}),
			inlineStyle: this._inlineCSS,
			attributes: this._attributes,
			namespace: this._namespace
		};
	};

	proto._initialize = function() {
		var tree = this.getTree(),
			node = this.getNode();

		this._type = tree.getNodeType();
		this._id = tree.getId();
		this._name = tree.getNodeName();
		this._value = tree.getNodeValue();

		this.$_childAdded = _.bind(this._childAdded, this);
		this.$_childRemoved = _.bind(this._childRemoved, this);
		this.$_childrenChanged = _.bind(this._childrenChanged, this);

		this.$_updateAttributes = _.bind(this._updateAttributes, this);
		this.$_nodeValueChanged = _.bind(this._nodeValueChanged, this);
		this.$_inlineStyleChanged = _.bind(this._inlineStyleChanged, this);

		this._updateChildren(tree.getChildren());
		var treeInitializedPromise = tree.isInitialized().then(_.bind(function() {
			this._value = tree.getNodeValue();

			this._namespace = tree.getNamespace();
			//console.log(tree.getNamespace(), tree.getNodeName());
			this._attributes = tree.getAttributesMap();
			this._inlineCSS = tree.getInlineStyle();
			//this._updateAttributes(tree.getAttributesMap());
			var state = this._getState();
			if(tree.getNodeType() === 1) {
				state.attributesChanged(this, {
					attributes: this._attributes,
					inlineStyle: this._inlineCSS
				});
			}

			tree.on('childAdded', this.$_childAdded);
			tree.on('childRemoved', this.$_childRemoved);
			tree.on('childrenChanged', this.$_childrenChanged);

			tree.on('attributesChanged', this.$_updateAttributes);
			tree.on('nodeValueChanged', this.$_nodeValueChanged);
			tree.on('inlineStyleChanged', this.$_inlineStyleChanged);
		}, this)).catch(function(err) {
			console.log(err);
		});
	};

	proto.destroy = function() {
		var tree = this.getTree();
		_.each(this.getChildren(), function(child) {
			child.destroy();
		});

		tree.removeListener('childAdded', this.$_childAdded);
		tree.removeListener('childRemoved', this.$_childRemoved);
		tree.removeListener('childrenChanged', this.$_childrenChanged);

		tree.removeListener('attributesChanged', this.$_updateAttributes);
		tree.removeListener('nodeValueChanged', this.$_nodeValueChanged);
		tree.removeListener('inlineStyleChanged', this.$_inlineStyleChanged);

		log.debug('::: DESTROYED DOM SHADOW ' + this.getTree().getId() + ' :::');
	};

	proto.getId = function() {
		return this._id;
	};

	proto._postNewAttributes = function() {
		var socket = this._getSocket();
		socket.emit('attributesChanged', {
			id: this.getId(),
			attributes: this._attributes,
			inlineStyle: this._inlineCSS
		});
	};

	proto._updateAttributes = function(attributesMap) {
		this._attributes = attributesMap;
		this._postNewAttributes();
	};

	proto._inlineStyleChanged = function(event) {
		this._inlineCSS = event.inlineStyle;
		this._postNewAttributes();
	};

	proto._getSocket = function() {
		return this.options.socket;
	};

}(ShadowDOM));

module.exports = {
	ShadowDOM: ShadowDOM
};