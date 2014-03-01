var endpoint = 'http://datahub.io/api'
  , ckan = new CKAN.Client(endpoint)
  ;

var DataView = Backbone.View.extend({
  class: 'data-view',
  initialize: function(options) {
    var self = this;
    // var resource = new Backbone.Model
    this.dataset = new recline.Model.Dataset({
      endpoint: endpoint,
      id: options.resourceId,
      backend: 'ckan'
    });
    this.dataset.fetch()
      .done(function() {
        self.render();
      });
//    client.action('datastore_search', {resource_id: options.resourceId}, function(err, out) {
//      if (err) {
//        console.error(err)
//        console.log(JSON.parse(err.message));
//        return;
//      };
//    });
  },
  render: function() {
    var gridView = {
        id: 'grid',
        label: 'Grid',
        view: new recline.View.SlickGrid({
          model: this.dataset,
          state: {
            fitColumns: true
          }
        })
      };
    this.view = new recline.View.MultiView({
      model: this.dataset,
      views: [gridView],
      sidebarViews: [],
      el: $(this.el)
    });
    this.view.render();
    this.dataset.query({size: this.dataset.recordCount});
  }
});

var CKANSearchWidget = Backbone.View.extend({
  template: '\
    <div class="data-search"> \
      <form class="form">\
        <input type="search" value="{{q}}" placeholder="Search for data" />\
        <br />\
        <p class="help-block">We\'ll only show datasets where data is in the DataStore</p> \
      </form>\
      <ul class="dataset-list"></ul>\
    </div> \
  ',
  templateDataset: ' \
    <div class="dataset summary"> \
      <h4>{{title}}</h4> \
      {{# resources }}\
      <ul class="resource-list">\
        {{# datastore_active}} \
        <li class="active"> \
          <a href="#" class="js-add-resource" data-id="{{id}}">{{ name }}</a> \
        {{/ datastore_active}} \
        {{^ datastore_active }} \
        <li> \
            <span title="not in DataStore">{{ name }}</span> \
        {{/ datastore_active }} \
        </li> \
      </ul> \
      {{/resources }}\
    <div> \
  ',
  events: {
    'submit form': 'query',
    'click .js-add-resource': '_selectResource'
  },
  initialize: function() {
    var self = this;
    this.collection = new Backbone.Collection();
    _.bindAll(this, 'render');
    this.collection.bind('reset', this.render);
    // first get list of all resources in the datastore
    ckan.action('datastore_search', {resource_id: '_table_metadata'}, function(err, out) {
      self.resourcesInDatastore = _.pluck(out.result.records, 'name');
      self.query();
    });
  },
  render: function() {
    var self = this;
    var html = Mustache.render(this.template, {q: this.currentQuery});
    this.$el.html(html);
    this.collection.each(function(dataset) {
      var html = Mustache.render(self.templateDataset, dataset.toJSON());
      self.$el.find('.dataset-list').append(html);
    });
    return this;
  },
  query: function(e) {
    var self = this;
    if (e) {
      e.preventDefault();
    }
    this.currentQuery = this.$('form input[type="search"]').val();
    ckan.action('dataset_search', {q: this.currentQuery}, function(err, out) {
      _.each(out.result.results, function(dataset) {
        // should have datastore_active set but unfortunately not ...
        // see https://raw.github.com/datasets/gold-prices/master/data/data.csv
        _.each(dataset.resources, function(res) {
            console.log(res.id);
            console.log(self.resourcesInDatastore);
          if (self.resourcesInDatastore.indexOf(res.id) != -1) {
            res.datastore_active = true;
          }
        });
      });
      self.collection.reset(out.result.results);
    });
  },
  _selectResource: function(e) {
    e.preventDefault();
    var id = $(e.target).data('id');
    this.trigger('resource:select', id);
  }
});

jQuery(document).ready(function($) {
  var $el = $('.dataset-search-here');
  var search = new CKANSearchWidget({
    el: $el
  });
  var $container = $('.data-views-container');
  search.on('resource:select', function(id) {
    console.log(id);
    var $el = $('<div class="data-view"></div>');
    $container.append($el);
    var view = new DataView({
      resourceId: id,
      el: $el
    });
  });

});
