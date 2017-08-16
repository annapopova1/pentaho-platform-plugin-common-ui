/*!
 * Copyright 2010 - 2017 Pentaho Corporation.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * <h2>The Text Input Builder</h2>
 *
 * To use the TextInputBuilder you should require the appropriate file
 * from Common-Ui:
 *
 * <pre><code>
 *   require(['common-ui/prompting/builders/TextInputBuilder'],
 *     function(TextInputBuilder) {
 *
 *     }
 *   );
 * </code></pre>
 *
 * To get the component you'll have to create a new instance of the builder and
 * call the <code>build</code> method:
 *
 * <pre><code>
 *   var textInputBuilder = new TextInputBuilder();
 *
 *   var textInputComponent = textInputBuilder.build(args);
 * </code></pre>
 *
 * where 'args' is an object that contains the prompt panel and the parameters
 * necessary for the component as per [the CDF documentation]{@link http://localhost:8080/pentaho/api/repos/:public:plugin-samples:pentaho-cdf:pentaho-cdf-require:30-documentation:30-component_reference:10-core:37-TextInputComponent:text_input_component.xcdf/generatedContent}.
 *
 * <p>
 *   Note: the CDF documentation points to the Dashboard located on the Pentaho BI Server
 * </p>
 *
 * @name TextInputBuilder
 * @class
 * @extends FormattedParameterWidgetBuilderBase
 */
define([
  "common-ui/util/util",
  "dojo/number",
  "cdf/components/TextInputComponent",
  "./FormattedParameterWidgetBuilderBase",
  "common-ui/jquery-clean",
  "common-ui/underscore"
], function(Util, DojoNumber, TextInputComponent, FormattedParameterWidgetBuilderBase, $, _) {

  var currentDashboard;

  return FormattedParameterWidgetBuilderBase.extend({
    /**
     * Builds the widget and returns a TextInputComponent
     * @method
     * @name TextInputBuilder#build
     * @param {Object} args The arguments to build the widget in accordance with [the CDF documentation]{@link http://localhost:8080/pentaho/api/repos/:public:plugin-samples:pentaho-cdf:pentaho-cdf-require:30-documentation:30-component_reference:10-core:37-TextInputComponent:text_input_component.xcdf/generatedContent}.
     * @param {PromptPanel} args.promptPanel - The instance of PromptPanel
     * @param {ParameterDefinition} args.promptPanel.paramDefn - The parameter definition
     * @param {Parameter} args.param - The Parameter instance
     * @param {Boolean?} args.param.attributes.addClearIcon - The whether creating a clear icon for the text input
     *   component. By default the clear icon is not created.
     * @param {String?} args.param.attributes.clearIconClassName - The CSS class name for the clear icon. It's used
     *   if the clear icon is defined.
     * @param {Boolean?} args.param.attributes.refreshOnEveryKeyUp - The whether processing every keyup event. By
     *   default keyup event processes only enter key.
     * @param {Boolean?} args.param.attributes.cacheComponent - The whether caching the current instance of the text
     *   input component to avoid recreating it each time for example, for processing each keyup event. It helps
     *   avoid flickering. By default the instance is not cached.
     * @returns {TextInputComponent} The TextInputComponent built
     */
    build: function(args) {
      function parseNumber(val) {
        try {
          return DojoNumber.parse(val, {locale: Util.normalizeDojoLocale(SESSION_LOCALE)});
        } catch(e) {
          return DojoNumber.parse(val, {locale: "en"});
        }
      }
      function formatNumber(val) {
        try {
          return DojoNumber.format(val, {locale: Util.normalizeDojoLocale(SESSION_LOCALE)});
        } catch(e) {
          return DojoNumber.format(val, {locale: "en"});
        }
      }
      var widget = this.base(args);
      var name = widget.name + "-input";
      $.extend(widget, {
        name: name,
        type: "TextInputComponent",
        preChange: function() {
          var val = $("#" + this.name).attr("value");
          this.dashboard.setParameter(this.parameter, parseNumber(val));
          currentDashboard = this.dashboard;
        },
        postExecution: function() {
          this.base();

          var initialValue;
          $.each(this.param.values, function(i, v) {
            if(v.selected) {
              initialValue = this.formatter ? this.formatter.format(this.transportFormatter.parse(v.value)) : v.value;

              try {
                if(isNaN(v.value) || Math.abs(v.value) == Infinity) {
                  var valueParsed = null;
                } else {
                  if(Util.isNumberType(v.type)) {
                    valueParsed = formatNumber(v.value);
                  } else {
                    valueParsed = v.value;
                  }
                }
              } catch(e) {
                valueParsed = v.value;
              }

              if(valueParsed != null) {
                initialValue = v.label = v.value = valueParsed;
              }
            }
          }.bind(this));

          $("#" + this.name).val(initialValue);
          currentDashboard = undefined;
        },
        addClearIcon: args.param.attributes.addClearIcon,
        clearIconClassName: args.param.attributes.clearIconClassName,
        refreshOnEveryKeyUp: args.param.attributes.refreshOnEveryKeyUp
      });

      if(args.param.attributes.cacheComponent) {
        if(currentDashboard) {
          var currentComponent = _.select(currentDashboard.components, function(component) {
            return component.parameter === widget.parameter && component.type === "TextInputComponent";
          });
          // If component already exists then the same is returned
          if(currentComponent && currentComponent.length > 0) {
            return currentComponent[0];
          }
        }
      }
      return new TextInputComponent(widget);
    }
  });
});
