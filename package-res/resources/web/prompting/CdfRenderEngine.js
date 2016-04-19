/*!
 * Copyright 2016 Pentaho Corporation.  All rights reserved.
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

define(["dojo/_base/declare", "./IRenderEngine", './WidgetBuilder', 'cdf/Dashboard.Clean', 'cdf/Logger', 'common-ui/jquery-clean'],
  function(declare, IRenderEngine, WidgetBuilder, Dashboard, Logger, $) {
    return declare(IRenderEngine, {

      dashboard: undefined,
      widgetBuilder: undefined,

      constructor: function(destinationId) {
        this.dashboard = new Dashboard();
        this.widgetBuilder = WidgetBuilder;
      },

      getParameterValue: function(param) {
        return this.dashboard.getParameterValue(this.getParameterName(param));
      },

      setParameterValue: function(param, value) {
        this.dashboard.setParameter(this.getParameterName(param), value);
      },

      createPromptPanel: function(paramDefn) {
        this.promptGUIDHelper.reset();
        this._initializePrivateProperties(paramDefn);
        var layout = this._createWidgetForPromptPanel.call(this, paramDefn);
        var components = this._processComponents(layout);
        this.dashboard.addComponents(components);
        this.dashboard.init();
      },

      updatePromptPanel: function(paramDefn) {
        this._initializePrivateProperties(paramDefn);
        var layout = this.dashboard.getComponentByName("prompt" + this.guid);
        this._processComponents(layout, true, function(component) {
          this.dashboard.updateComponent(component);
        });
      },

      removeComponentsByDiff: function(paramDefn, diff) {
        this._removeComponentsByDiff(paramDefn, diff);
      },

      addComponentsByDiff: function(paramDefn, diff) {
        this._addComponentsByDiff(paramDefn, diff);
      },

      changeComponentsByDiff: function(paramDefn, diff) {
        this._changeComponentsByDiff(paramDefn, diff);
      },

      showProgressIndicator: function() {
        this.dashboard.showProgressIndicator();
      },

      hideProgressIndicator: function() {
        this.dashboard.hideProgressIndicator();
      },

      setBlockUiOptions: function(options) {
        this.dashboard._setBlockUiOptions(options);
      },

      registerOnReady: function(callback) {
        this._onReady = callback;
      },

      registerOnSubmit: function(callback) {
        this._onSubmit = callback;
      },

      registerOnParameterChanged: function(callback) {
        this._onParameterChanged = callback;
      },

      registerOnPostInit: function(callback) {
        this.dashboard.on('cdf:postInit', callback);
      },

      _initializePrivateProperties: function(paramDefn) {
        if (this.dashboard.components) {
          // Create dictionary by parameter name, of topValue of multi-select listboxes, for restoring later, when possible.
          // But not for mobile, cause the UIs vary. Would need more time to check each.
          var topValuesByParam;
          if (!(/android|ipad|iphone/i).test(navigator.userAgent)) {
            topValuesByParam = this._multiListBoxTopValuesByParam = {};
          }

          var focusedParam;
          this._mapComponentsList(this.dashboard.components, (function(c) {
            if (!c.components && c.param && c.promptType === 'prompt') {
              if (!focusedParam) {
                var ph = c.placeholder();
                if ($(":focus", ph).length) {
                  focusedParam = c.param.name;
                }
              }

              if (topValuesByParam && c.type === 'SelectMultiComponent') {
                var topValue = c.topValue();
                if (topValue != null) {
                  topValuesByParam['_' + c.param.name] = topValue;
                }
              }
            } else if (topValuesByParam && c.type === 'ScrollingPromptPanelLayoutComponent') {
              // save last scroll position for prompt panel
              var scrollTopElem = c.placeholder().children(".prompt-panel");
              var scrollTopValue = scrollTopElem.scrollTop();
              var scrollLeftElem = scrollTopElem.children(".parameter-wrapper");
              var scrollLeftValue = scrollLeftElem.scrollLeft();
              if (scrollTopValue != null && scrollLeftValue != null) {
                topValuesByParam['_' + c.name] = {
                  scrollTopValue: scrollTopValue,
                  scrollLeftValue: scrollLeftValue
                };
              }
            }

            if (c.param) {
              c.param = paramDefn.getParameter(c.param.name);
            }
          }).bind(this));

          this._focusedParam = focusedParam;
        }
      },

      _processComponents: function(parent, isRefresh, callback) {
        var components = [];

        var topValuesByParam = this._multiListBoxTopValuesByParam;
        if (topValuesByParam) {
          delete this._multiListBoxTopValuesByParam;
        }

        var focusedParam = this._focusedParam;
        if (focusedParam) {
          delete this._focusedParam;
        }

        var updateComponent = (function(component) {
          components.push(component);

          if (!component.components && component.param && component.promptType === 'prompt') {
            var name = component.param.name;
            if (focusedParam && focusedParam === name) {
              focusedParam = null;
              component.autoFocus = true;
            }

            if (topValuesByParam && component.type === 'SelectMultiComponent') {
              var topValue = topValuesByParam['_' + name];
              if (topValue != null) {
                component.autoTopValue = topValue;
              }
            }
          } else if (topValuesByParam && component.type === 'ScrollingPromptPanelLayoutComponent') {
            // save prompt pane reference and scroll value to dummy component
            var scrollValue = topValuesByParam['_' + component.name];
            if (scrollValue != null) {
              var setScroll = function() {
                var scrollElem = $("#" + component.htmlObject).children(".prompt-panel");
                scrollElem.scrollTop(scrollValue.scrollTopValue);
                scrollElem.children(".parameter-wrapper").scrollLeft(scrollValue.scrollLeftValue);
              }

              // restore last scroll position for prompt panel
              if (!isRefresh) {
                this.dashboard.postInit(function() {
                  if (scrollTopValue) {
                    setScroll();
                    scrollValue = undefined;
                  }
                });
              } else {
                setTimeout(function() {
                  setScroll();
                }, 50);
              }
            }
          }

          if (callback) {
            callback.call(this, component);
          }
        }).bind(this);

        this._mapComponents(parent, updateComponent);

        return components;
      },

      _buildPanelComponents: function(paramDefn) {
        var panelGroupComponents = [];
        // Create a composite panel of the correct layout type for each group
        $.each(paramDefn.parameterGroups, function(i, group) {
          var components = [];
          // Create a label and a CDF widget for each parameter
          $.each(group.parameters, function(i, param) {
            if (param.attributes['hidden'] == 'true') {
              // initialize parameter values regardless of whether we're showing the parameter or not
              this.initializeParameterValue(param);
              return;
            }
            components.push(this._buildPanelForParameter(paramDefn, param));
          }.bind(this));

          if (components.length > 0) {
            panelGroupComponents.push(this._createWidgetForGroupPanel.call(this, group, components, paramDefn.layout));
          }
        }.bind(this));

        if (panelGroupComponents.length > 0) {
          panelGroupComponents.push(this._createWidgetForSubmitPanel.call(this, paramDefn));
        }

        return panelGroupComponents;
      },

      _buildPanelForParameter: function(paramDefn, param) {
        var panelComponents = [];

        // initialize parameter values regardless of whether we're showing the parameter or not
        this.initializeParameterValue(param);

        //add the label widget
        panelComponents.push(this._createWidgetForLabel.call(this, param));

        //add the error widgets
        var errors = paramDefn.errors[param.name];
        if (errors) {
          $.each(errors, function(i, e) {
            panelComponents.push(this._createWidgetForErrorLabel.call(this, param, e));
          }.bind(this));
        }

        //add the parameter widget
        var widget = this._createWidgetForParameter.call(this, paramDefn, param);
        if (widget) {
          panelComponents.push(widget);
        } else { // No widget created. Do not create a label or parameter panel
          Logger.log("No widget created, return");
          return undefined;
        }

        var panel = this._createWidgetForParameterPanel.call(this, param, panelComponents);

        if (errors && errors.length > 0) {
          panel.cssClass = (panel.cssClass || '') + ' error';
        }

        return panel;
      },

      /**
       * Creates a Widget calling the widget builder factory
       *
       * @name PromptPanel#_createWidget
       * @method
       * @param {Object} options with the properties to be added to the Widget
       * @param {String} type the type of the Widget to build
       * @returns {BaseComponent} A widget instance
       * @private
       */
      _createWidget: function(options, type) {
        var newObj = $.extend(options, {
          renderEngine: this
        });
        return this.widgetBuilder.build(newObj, type);
      },

      /**
       * Creates a Widget for the Parameter
       *
       * @name PromptPanel#_createWidgetForParameter
       * @method
       * @param param {Parameter} The param to be created
       * @returns {Object} A widget for the given parameter
       * @private
       */
      _createWidgetForParameter: function(paramDefn, param) {
        if (param.strict && param.values.length === 0) {
          // if the parameter is strict but we have no valid choices for it, it is impossible for the user to give it a
          // value, so we will hide this parameter it is highly likely that the parameter is driven by another parameter
          // which doesn't have a value yet, so eventually, we'll show this parameter.. we hope
          return null;
        }

        return this._createWidget.call(this, {
          paramDefn: paramDefn,
          param: param
        });
      },

      /**
       * Creates a Widget for the Label
       *
       * @name PromptPanel#_createWidgetForLAbel
       * @method
       * @param {Parameter} param The param to be created
       * @returns {BaseComponent} A widget for the given parameter
       * @private
       */
      _createWidgetForLabel: function(param) {
        return this._createWidget.call(this, {
          param: param
        }, 'label');
      },

      /**
       * Creates a Widget for the Error Label
       *
       * @name PromptPanel#_createWidgetForErrorLabel
       * @method
       * @param {Parameter} param The param to be created
       * @param {String} e The error message
       * @returns {BaseComponent} A widget for the given parameter
       * @private
       */
      _createWidgetForErrorLabel: function(param, e) {
        return this._createWidget.call(this, {
          param: param,
          errorMessage: e
        }, 'error-label');
      },

      /**
       * Creates a Widget for the Parameter Panel
       *
       * @name PromptPanel#_createWidgetForParameterPanel
       * @method
       * @param {Parameter} param The param definition
       * @param {Array|BaseComponent} components The Array of components to add to the Group Panel
       * @returns {BaseComponent} The Widget for the Parameter Panel
       * @private
       */
      _createWidgetForParameterPanel: function(param, components) {
        return this._createWidget.call(this, {
          param: param,
          components: components
        }, 'parameter-panel');
      },

      /**
       * Creates a Widget for the Group Panel
       *
       * @name PromptPanel#_createWidgetForGroupPanel
       * @method
       * @param {ParameterGroup} group The group definition
       * @param {Array|BaseComponent} components The Array of components to add to the Group Panel
       * @returns {BaseComponent} The Widget for the Group Panel
       * @private
       */
      _createWidgetForGroupPanel: function(group, components, layout) {
        return this._createWidget.call(this, {
          paramGroup: group,
          components: components,
          layout: layout
        }, 'group-panel');
      },

      /**
       * Creates a Widget for the Submit Component
       *
       * @name PromptPanel#createWidgetForSubmitComponent
       * @method
       * @returns {BaseComponent}
       */
      _createWidgetForSubmitComponent: function(paramDefn) {
        return this._createWidget.call(this, {
          paramDefn: paramDefn
        }, 'submit');
      },

      /**
       * Creates a Widget for the Submit Panel
       *
       * @name PromptPanel#_createWidgetForSubmitPanel
       * @method
       * @returns {BaseComponent}
       * @private
       */
      _createWidgetForSubmitPanel: function(paramDefn) {
        return this._createWidget.call(this, {
          paramDefn: paramDefn
        }, 'submit-panel');
      },

      /**
       * Creates a Widget for the Prompt Panel
       *
       * @name PromptPanel#_createWidgetForPromptPanel
       * @method
       * @returns {BaseComponent}
       * @private
       */
      _createWidgetForPromptPanel: function(paramDefn) {
        return this._createWidget.call(this, {
          paramDefn: paramDefn
        }, 'prompt-panel');
      },

      /**
       * Pre-order traversal of a component and its descendants.
       *
       * @name PromptPanel#_mapComponents
       * @method
       * @param {BaeComponent} component The component to iterate
       * @param {callback~cb} callback The callback to call on each component
       * @private
       */
      _mapComponents: function(component, callback) {
        callback(component);
        if (component.components) {
          this._mapComponentsList(component.components, callback);
        }
      },

      /**
       * Pre-order traversal of components given a list of root components.
       *
       * @name PromptPanel#_mapComponentsList
       * @method
       * @param {Array|BaseComponent} components The list of components to iterate
       * @param {callback~cb} callback The callback to call on each component
       */
      _mapComponentsList: function(components, callback) {
        $.each(components, function(i, component) {
          this._mapComponents(component, callback);
        }.bind(this));
      },

      /**
       * Gets a component by its parameter definition.
       *
       * @name _getComponentByParam
       * @method
       * @private
       * @param {ParameterDefinition} param
       * @param {bool} getPanel If true, retrieves the surrounding panel for the component
       *
       * @returns {BaseComponent|null} If no component is found, null will be returned
       */
      _getComponentByParam: function(param, getPanel) {
        var parameterName = this.getParameterName(param);
        return this._getComponentByParamName.call(this, parameterName, getPanel);
      },

      /**
       * Gets a component by its compile parameter name. Normally, it is a combination of the parameter name and the guid of the PromptPanel.
       *
       * @name _getComponentByParamName
       * @method
       * @private
       * @param {String} parameterName The compiled name of the prompt panel component
       * @param {bool} getPanel If true, retrieves the surrounding panel for the component
       *
       * @returns {BaseComponent|null} If no component is found, null will be returned
       */
      _getComponentByParamName: function(parameterName, getPanel) {
        for (var i in this.dashboard.components) {
          var component = this.dashboard.components[i];
          if (component.parameter === parameterName) {
            var isPanel = component.type.search("Panel") > -1;
            if ((getPanel && isPanel) || (!getPanel && !isPanel)) {
              return component;
            }
          }
        }
        return null;
      },

      /**
       * Removes a component from parent panel
       * @name _removeChildComponent
       * @method
       * @private
       * @param {BaseComponent} parent The parent component that has array of child components
       * @param {BaseComponent} toRemoveComponent The child component that should be deleted
       */
      _removeChildComponent: function(parent, toRemoveComponent) {
        var index = parent.components.indexOf(toRemoveComponent);
        if (index > -1) {
          parent.components.splice(index, 1);
        }
      },

      /**
       * Finds the specific submit component located on the parent panel component
       * @name _findSubmitComponent
       * @method
       * @private
       * @param {BaseComponent} panelComponent The parent panel component to search within for the submit component
       */
      _findSubmitComponent: function(panelComponent) {
        var result = null;
        for (var i = 0; i < panelComponent.components.length; i++) {
          if (panelComponent.components[i].promptType == "submit" && panelComponent.components[i].type == "FlowPromptLayoutComponent") {
            result = panelComponent.components[i];
            break;
          }
        }
        return result;
      },

      /**
       * Finds error's components are located on the parent panel component
       * @name _findErrorComponents
       * @method
       * @private
       * @returns {Array} The array of error's components
       */
      _findErrorComponents: function(panelComponent) {
        var result = [];
        if (panelComponent.components) {
          result = panelComponent.components.filter(function(item) {
            return item.promptType == "label" && item.type == "TextComponent" && item.isErrorIndicator;
          });
        }
        return result;
      },

      /**
       * Removes all components from the current instance of dashboard
       *
       * @name PromptPanel#removeDashboardComponents
       * @method
       * @param {Array|BaseComponent} components The list of components to be removed
       * @param {Boolean} postponeClear
       */
      _removeDashboardComponents: function(components, postponeClear) {
        var myself = this;
        // Traverse all embedded components to remove them

        var removed = [];
        this._mapComponentsList(components, function(component) {
          var rc = myself.dashboard.removeComponent(component.name);
          if (rc) {
            removed.push(rc);
          }
        });

        // Remove references to each removed components parameter but leave the parameter so it may be reselected if it's reused by
        // another component
        $.each(removed, function(i, component) {
          // It would be wise to always call component.clear() here except that since Dashboards.init() schedules the components
          // to update() in a setTimeout(). To prevent that, we'll clear the removed components with the GarbageCollectorComponent
          // when we initialize the next set of components.
          if (!postponeClear) {
            if (component.remove) {
              component.remove();
            } else {
              component.clear();
            }
          }

          if (component.parameter) {
            // Remove our parameter from any other listening components
            $.each(myself.dashboard.components, function(i, comp) {
              if ($.isArray(comp.listeners)) {
                comp.listeners = $.grep(comp.listeners, function(l) {
                  return l !== component.parameter;
                });
              }
            });
          }
        });
      },

      /**
       * Recursively adds the component and its children to the current dashboard
       *
       * @name _addComponent
       * @method
       * @private
       * @param {Array} component The parent component, which is added before its children
       */
      _addComponent: function(component) {
        this.dashboard.addComponent(component);
        this.dashboard.updateComponent(component);

        for (var i in component.components) { // Loop through panel components
          this._addComponent.call(this, component.components[i]);
        }
      },

      /**
       * Removes a set of components determined by the ParameterDefinitionDiffer#diff
       *
       * @name PromptPanel#_removeComponentsByDiff
       * @method
       * @param {JSON} toRemoveDiff The group of paramters which need to be removed
       */
      _removeComponentsByDiff: function(paramDefn, toRemoveDiff) {
        var toRemove = [];
        for (var groupName in toRemoveDiff) {
          var removeWrap = toRemoveDiff[groupName];
          var params = removeWrap.params;

          for (var i = 0; i < params.length; i++) {
            var param = params[i];
            var component = this._getComponentByParam.call(this, param, true); // get component panel by param
            if (component != null) {
              toRemove.push(component);

              // removes the component from the group panel and also removes the group panel if it's empty
              var groupPanel = this.dashboard.getComponentByName(groupName);
              if (groupPanel) {
                this._removeChildComponent.call(this, groupPanel, component);
                if (groupPanel.components.length == 0) {
                  toRemove.push(groupPanel);
                }
              }
            }
          }
        }

        // removes the submit panel if it's needed
        var panelComponent = this.dashboard.getComponentByName("prompt" + this.guid);
        if (panelComponent) {
          // we need to remove components from prompt panel component also
          for (var i in toRemove) {
            this._removeChildComponent.call(this, panelComponent, toRemove[i]);
          }

          if (panelComponent.components.length == 1) {
            var submitPanel = this._findSubmitComponent.call(this, panelComponent);
            if (submitPanel) {
              toRemove.push(submitPanel);
              this._removeChildComponent.call(this, panelComponent, submitPanel);
            }
          }

          this._removeDashboardComponents(toRemove);

          // we need clear global panel if it's empty after removing child components
          if (panelComponent.components.length == 0) {
            panelComponent.clear();
          }
        }
      },

      /**
       * Adds a set of components determined by the ParameterDefinitionDiffer#diff
       *
       * @name PromptPanel#_addComponentsByDiff
       * @method
       * @param {JSON} toAddDiff The group of parameters which need to be added
       */
      _addComponentsByDiff: function(paramDefn, toAddDiff) {
        var panelComponent = this.dashboard.getComponentByName("prompt" + this.guid);

        for (var groupName in toAddDiff) {
          var addWrap = toAddDiff[groupName];
          var params = addWrap.params;

          var fieldComponents = [];
          for (var i = 0; i < params.length; i++) {
            var param = params[i];
            var component = this._buildPanelForParameter(paramDefn, param); // creates a panel component

            if (param.after) { // Find component panel to insert after
              component.after = this._getComponentByParam.call(this, param.after, true);
            }

            fieldComponents.push(component);
          }

          // creates a new group panel if it's not present and adds the panel components to the group panel
          var groupPanel = this.dashboard.getComponentByName(groupName);
          if (!groupPanel) {
            groupPanel = this._createWidgetForGroupPanel.call(this, addWrap.group, fieldComponents, paramDefn.layout);
            panelComponent.components.push(groupPanel);
          } else {

            for (var j in fieldComponents) {
              var fieldComponent = fieldComponents[j];
              var insertAt = 0;
              if (fieldComponent.after) {
                var insertAfter = groupPanel.components.indexOf(fieldComponent.after);
                insertAt = insertAfter + 1;
              }
              groupPanel.components.splice(insertAt, 0, fieldComponent);
            }
          }
        }

        // creates a new submit panel if it's not present and adds the submit panel to the prompt panel
        if (panelComponent.components.length > 0 && !this._findSubmitComponent.call(this, panelComponent)) {
          var submitPanel = this._createWidgetForSubmitPanel.call(this, paramDefn);
          panelComponent.components.push(submitPanel);
        }

        this._addComponent.call(this, panelComponent);
      },

      /**
       * Change error's components determined by the ParameterDefinitionDiffer#diff
       *
       * @name PromptPanel#_changeErrors
       * @method
       * @param {Parameter} param The parameter
       * @private
       */
      _changeErrors: function(paramDefn, param) {
        if (param.isErrorChanged) {
          var errors = paramDefn.errors[param.name];
          var panel = this._getComponentByParam.call(this, param, true);
          var existingErrors = this._findErrorComponents.call(this, panel);

          // remove unused old errors components
          var toRemove = [];
          for (var errIndex in existingErrors) {
            var errComp = existingErrors[errIndex];
            var _isExistingErrComp = errors && errors.some(function(item) {
              return item == errComp.label;
            });
            if (!_isExistingErrComp) {
              for (var i in existingErrors) {
                this._removeChildComponent.call(this, panel, errComp);
              }
              toRemove.push(errComp);
            }
          }
          if (toRemove.length > 0) {
            this._removeDashboardComponents(toRemove);
          }

          // add new errors components
          if (errors) {
            for (var errIndex in errors) {
              var error = errors[errIndex];
              var isExist = existingErrors.some(function(item) {
                return item.label == error;
              });
              if (!isExist) {
                var errIndex = panel.components.length - 1;
                var errorComponent = this._createWidgetForErrorLabel.call(this, param, error);
                this.dashboard.addComponent(errorComponent);
                panel.components.splice(errIndex, 0, errorComponent);
              }
            }
          }

          // checks existing errors components to set correct css style
          var existingErrorComponents = this._findErrorComponents.call(this, panel);
          if (existingErrorComponents.length > 0) {
            if (!panel.cssClass || (panel.cssClass && panel.cssClass.indexOf('error') == -1)) {
              panel.cssClass = (panel.cssClass || '') + ' error';
            }
          } else {
            panel.cssClass = (panel.cssClass || '').replace(' error', '');
            panel.removeErrorClass();
          }
        }
      },

      /**
       * Changes the data and selects the current value(s) of a set of components determined by the ParameterDefinitionDiffer#diff.
       *
       * @name PromptPanel#_changeComponentsByDiff
       * @method
       * @param {JSON} toChangeDiff The group of parameters which need to be have their data changed
       */
      _changeComponentsByDiff: function(paramDefn, toChangeDiff) {
        for (var groupName in toChangeDiff) {
          var changeWrap = toChangeDiff[groupName];
          var params = changeWrap.params;

          for (var i in params) {
            var param = params[i];

            var component = this._getComponentByParam.call(this, param);
            if (component != null) {
              var updateNeeded = false;
              // also we should check and update errors components
              this._changeErrors(paramDefn, param);

              // Create new widget to get properly formatted values array
              var newValuesArray = this.widgetBuilder.build({
                param: param,
                renderEngine: this,
                paramDefn: paramDefn
              }, param.attributes["parameter-render-type"]).valuesArray;

              if (JSON.stringify(component.valuesArray) !== JSON.stringify(newValuesArray) || param.forceUpdate) {
                // Find selected value in param values list and set it. This works, even if the data in valuesArray is different
                this.initializeParameterValue(param);

                // Set new values array
                component.valuesArray = newValuesArray;
                updateNeeded = true;
              }

              if (!updateNeeded) {
                var paramSelectedValues = param.getSelectedValuesValue();
                var dashboardParameter = this.dashboard.getParameterValue(component.parameter);

                // if the dashboardParameter is not an array, paramSelectedValues shouldn't be either
                if (!_.isArray(dashboardParameter) && paramSelectedValues.length == 1) {
                  paramSelectedValues = paramSelectedValues[0];
                }

                updateNeeded = this.areParamsDifferent(dashboardParameter, paramSelectedValues, param.type);
              }

              if (updateNeeded) {
                var groupPanel = this.dashboard.getComponentByName(groupName);
                this._mapComponents(groupPanel, function(component) {
                  this.dashboard.updateComponent(component);
                }.bind(this));
              }
            }
          }
        }
      }
    });
  });