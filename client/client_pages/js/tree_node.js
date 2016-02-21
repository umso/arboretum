var ELEMENT_NODE = Node.ELEMENT_NODE;
var TEXT_NODE = Node.TEXT_NODE;
var PROCESSING_INSTRUCTION_NODE = Node.PROCESSING_INSTRUCTION_NODE;
var COMMENT_NODE = Node.COMMENT_NODE;
var DOCUMENT_NODE = Node.DOCUMENT_NODE;
var DOCUMENT_TYPE_NODE = Node.DOCUMENT_TYPE_NODE;
var DOCUMENT_FRAGMENT_NODE = Node.DOCUMENT_FRAGMENT_NODE;

$.widget('arboretum.tree_node', {
	options: {
		id: false,
		name: '',
		type: false,
		attributes: {},
		inlineStyle: '',
		children: [],
		state: false,
	},
	_create: function() {
		this.initialChildren = this.element.children();
		this._initialize(this.option('node'));
	},
	_initialize: function(data) {
		var state = this.option('state');
		state.registerNode(this.option('id'), this);

		this._initializeAttributes(this.option('attributes'));
		this._initializeInlineStyle(this.option('inlineStyle'));
		this._initializeChildren(this.option('children'));
	},
	_setOption: function(key, value) {
		this._super(key, value);
	},
	_initializeAttributes: function(attributes) {
		_.each(attributes, function(value, key) {
			this.element.attr(key, value);
		}, this);
	},
	_initializeInlineStyle: function(style) {
		if(style) {
			this.element.attr('style', style);
		} else {
			this.element.removeAttr('style');
		}
	},
	_getChildElement: function(child) {
		var childType = child.type,
			childElem;

		if(childType === ELEMENT_NODE || childType === DOCUMENT_NODE || childType === DOCUMENT_TYPE_NODE) {
			var name = child.name,
				childElem = $('<'+name+'/>');
		} else if(childType === TEXT_NODE) {
			childElem = document.createTextNode(child.value);
		} else {
			childElem = false;
		}
		return childElem;
	},
	_postChildElementAdded: function(child, childElem) {
		var state = this.option('state'),
			childType = child.type;

		if(childType === ELEMENT_NODE || childType === DOCUMENT_NODE) {
			childElem.tree_node(_.extend({
				state: state
			}, child));
		} else if(childType === TEXT_NODE) {
			state.registerNode(child.id, childElem);
		}
	},
	_initializeChildren: function(children) {
		_.each(children, function(child) {
			childElem = this._getChildElement(child);

			if(childElem) {
				this.element.append(childElem);
				this._postChildElementAdded(child, childElem);
			}
		}, this);
	},

	childAdded: function(child, previousChild) {
		var children = this.option('children'),
			childElem = this._getChildElement(child);

		if(childElem) {
			if(previousChild) {
				var childElements = this.element.children(),
					toAdddIndex = -1,
					toAddAfter;
				$.each(childElements, function(i, elem) {
					var tree_node = $(elem).data('arboretum-tree_node');
					if(tree_node === previousChild) {
						toAdddIndex = i;
						toAddAfter = $(elem);
					}
				});
				if(toAdddIndex >= 0) {
					toAddAfter.after(childElem);
				} else {
					throw new Error('Could not find node');
				}
			} else if(this.initialChildren.length > 0) {
				this.initialChildren.last().after(childElem);
			} else {
				children.unshift(child);
				this.element.prepend(childElem);
			}

			this._postChildElementAdded(child, childElem);
		}
		this.option('children', children);
	},
	childRemoved: function(child) {
		if(child.nodeType === TEXT_NODE) {
			$(child).remove();
			this.option('children', _.filter(children, function(c) { return c !== child; }));
		} else {
			var id = child.option('id'),
				children = this.option('children');

			child.element.remove();

			this.option('children', _.filter(children, function(child) { return child.id !== id; }));
		}
	},
	setChildren: function(children) {
		var previousChildren = this.option('children');
		this.option('children', children);

		this.element.children().not(this.initialChildren).remove();
		this._initializeChildren(children);
	},
	setAttributes: function(attributes, inlineStyle) {
		var previousAttributes = this.option('attributes'),
			previousInlineStyle = this.option('inlineStyle');

		this.option({
			attributes: attributes,
			inlineStyle: inlineStyle
		});

		var oldAttributeKeys = _.keys(previousAttributes);
		_.each(attributes, function(val, key) {
			try {
				this.element.attr(key, val);
			} catch(e) {
				console.error(e);
			}
		}, this);
		_.each(_.keys(previousAttributes), function(key) {
			if(!_.has(attributes, key)) {
				this.element.removeAttr(key);
			}
		}, this);

		if(inlineStyle) {
			this.element.attr('style', inlineStyle);
		} else {
			this.element.removeAttr('style');
		}
	},
	_destroy: function() {
		var state = this.option('state');
		state.unregisterNode(this.option('id'), this);
		this.element.children().remove();
	}
});