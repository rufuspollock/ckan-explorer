
// will be setup in document ready below as we need to parse query string
var ckan = null;
var startDataset = null;
var DataView = Backbone.View.extend({
  class: 'data-view',
  initialize: function(options) {
    var self = this;
    // var resource = new Backbone.Model
    this.dataset = new recline.Model.Dataset({
      endpoint: options.endpoint,
      id: options.resourceId,
      apiKey: options.apiKey,
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
    var html = Mustache.render(this.template, {
      resource: this.dataset.toJSON()
    });
    this.$el.html(html);
    this.view = this._makeMultiView(this.dataset, this.$el.find('.multiview'));
    this.dataset.query({
      size: this.dataset.recordCount
    });
  },
  _makeMultiView: function(dataset, $el) {
    var gridView = {
      id: 'grid',
      label: 'Grid',
      view: new recline.View.SlickGrid({
        model: dataset,
        state: {
          fitColumns: true
        }
      })
    };
    var graphView = {
      id: 'graph',
      label: 'Graph',
      view: new recline.View.Flot({
        model: dataset
      })
    };
    var mapView = {
      id: 'map',
      label: 'Map',
      view: new recline.View.Map({
        model: dataset
      })
    };
    view = new recline.View.MultiView({
      model: dataset,
      views: [gridView, graphView, mapView],
      sidebarViews: [],
      el: $el
    });
    return view;
  },
  events: {
    'submit .query-sql': 'sqlQuery',
    'click #save': 'saveResource'
  },
  template: ' \
    <form class="form query-sql"> \
      <h3>SQL Query</h3> \
      <p class="help-block">Query this table using SQL via the <a href="http://docs.ckan.org/en/latest/maintaining/datastore.html#ckanext.datastore.logic.action.datastore_search_sql">DataStore SQL API</a></p> \
      <textarea style="width: 95%;">SELECT * FROM "{{resource.id}}"</textarea><br> \
      <div class="sql-error alert alert-error" style="display: none;"></div> \
      <button type="submit" class="btn btn-primary">Query</button> \
      <button type="submit" id="save" title="Future work!" class="disabled btn btn-primary">Save <em>current</em> results as new resource</button> \
    </form> \
    <div class="sql-results"></div> \
    <div class="multiview"></div> \
  ',
  saveResource: function(e) {
    var self = this;
    e.preventDefault();
    alert('Not done yet!');
  },
  sqlQuery: function(e) {
    var self = this;
    e.preventDefault();
    var $error = this.$el.find('.sql-error');
    $error.hide();
    var sql = this.$el.find('.query-sql textarea').val();
    // replace ';' on end of sql as seems to trigger a json error
    sql = sql.replace(/;$/, '');
    ckan.datastoreSqlQuery(sql, function(err, data) {
      if (err) {
        var msg = '<p>Error: ' + err.message + '</p>';
        $error.html(msg);
        $error.show('slow');
        return;
      }
      // now handle good case ...
      var dataset = new recline.Model.Dataset({
        records: data.hits,
        fields: data.fields
      });
      dataset.fetch();
      // remove existing stuff
      $('.multiview').remove();
      // destroy existing view ...
      var $el = $('<div />');
      $('.sql-results').append($el);
      if (self.sqlResultsView) {
        self.sqlResultsView.remove();
      }
      self.sqlResultsView = self._makeMultiView(dataset, $el);
      dataset.query({
        size: dataset.recordCount
      });
    });
  }
});
var CKANSearchWidget = Backbone.View.extend({
  template: '\
    <div class="data-search"> \
      <h3>Available tables</h3> \
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
              <a href="#" class="js-add-resource" data-id="{{id}}">{{ name }}</a><br>&nbsp;<a class="btn btn-primary btn-mini pull-right" href="?endpoint={{endpoint}}&apikey={{apikey}}&dataset={{id}}" target="_blank">New Tab</a> \
          {{/ datastore_active}} \
          {{^ datastore_active }} \
            <li> \
              <!-- <span title="not in DataStore">{{ name }}</span> --> \
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
    ckan.action('datastore_search', {
      resource_id: '_table_metadata',
      limit: 100000
    }, function(err, out)
    {
      self.resourcesInDatastore = _.pluck(out.result.records, 'name');
      self.query();
    });
  },
  render: function() {
    var self = this;
    var html = Mustache.render(this.template, {
      q: this.currentQuery
    });
    this.$el.html(html);
    this.collection.each(function(dataset) {
      var stuff = dataset.toJSON();
      stuff.apikey = ckan.apiKey;
      stuff.endpoint = ckan.endpoint;
      var html = Mustache.render(self.templateDataset, stuff);
      self.$el.find('.dataset-list').append(html);
    });
    return this;
  },
  query: function(e) {
    var self = this;
    if (e) {
      e.preventDefault();
    }
    this.currentQuery = $('form input[type="search"]').val();
    ckan.action('package_search', {
      include_private: true,
      q: this.currentQuery
    }, function(err, out) {
      var subkey = "results";
      _.each(out.result[subkey], function(dataset) {
        // should have datastore_active set but unfortunately not ...
        // see https://raw.github.com/datasets/gold-prices/master/data/data.csv
        _.each(dataset.resources, function(res) {
          // make sure it has a name because we use it in the templating ...
          res.name = res.name || res.description.slice(0, 30) || 'No name';
          // console.log(self.resourcesInDatastore);
          if (self.resourcesInDatastore.indexOf(res.id) != -1) {
            res.datastore_active = true;
          }
        });
      });
      self.collection.reset(out.result[subkey]);
      if (startDataset) {
        self.trigger('resource:select', startDataset);
      }
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
  // support for using query string state
  var qs = parseQueryString(location.search);
  var endpoint = qs.endpoint || '//demo.ckan.org';
  var apikey = qs.apikey || '';
  if (!endpoint.match(/api$/)) {
    endpoint += '/api'
  }
  // defined in global namespace above but set to null
  ckan = new CKAN.Client(endpoint, apikey)
  if (qs.dataset) {
    startDataset = qs.dataset;
  }
  var search = new CKANSearchWidget({
    el: $el
  });
  var $container = $('.data-views-container');
  search.on('resource:select', function(id) {
    $('.intro-div').hide('slow');
    var $el = $('<div class="data-view"></div>');
    $('.data-view').remove();
    $container.append($el);
    var view = new DataView({
      resourceId: id,
      endpoint: endpoint,
      apiKey: apikey,
      el: $el
    });
  });
  if (qs.resource) {
    search.trigger('resource:select', qs.resource);
  }
});
parseQueryString = function(q) {
  if (!q) {
    return {};
  }
  var urlParams = {},
    e, d = function(s) {
      return decodeURIComponent(s.replace(/\+/g, " "));
    },
    r = /([^&=]+)=?([^&]*)/g;
  if (q && q.length && q[0] === '?') q = q.slice(1);
  while (e = r.exec(q)) {
    // TODO: have values be array as query string allow repetition of keys
    urlParams[d(e[1])] = d(e[2]);
  }
  return urlParams;
};
