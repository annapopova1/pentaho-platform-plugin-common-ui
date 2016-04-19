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

define(['cdf/lib/Base', 'cdf/Logger', 'dojo/number', 'dojo/i18n', 'common-ui/util/util', './parameters/ParameterDefinitionDiffer',
    'common-ui/jquery-clean', './CdfRenderEngine'
  ],
  function(Base, Logger, DojoNumber, i18n, Utils, ParamDiff, $, CdfRenderEngine) {

    // Add specific prompting message bundle
    if (pentaho.common.Messages) {
      pentaho.common.Messages.addUrlBundle('prompting', CONTEXT_PATH + 'i18n?plugin=common-ui&name=resources/web/prompting/messages/messages');
    }

    var _STATE_CONSTANTS = {
      readOnlyProperties: ["promptNeeded", "paginate", "totalPages", "showParameterUI", "allowAutoSubmit"],
      msgs: {
        notChangeReadonlyProp: function(readOnlyProperties) {
          return "Not possible to change the following read-only properties: " + readOnlyProperties + ".";
        },
        incorrectBooleanType: function(name, value) {
          return "Unexpected value '" + value + "' for '" + name + "'. Must be boolean type.";
        },
        notAllowedAutoSubmit: "Not possible to set 'autoSubmit'. It's limited by the 'allowAutoSubmit' flag.",
        incorrectNumberType: function(page) {
          return "Unexpected value '" + page + "' for 'page'. Must be a number type.";
        },
        paginationNotActivated: function(page) {
          return "Not possible to set page '" + page + "'. The pagination should be activated.";
        },
        incorrectPageValue: function(page, totalPages) {
          return "Not possible to set page '" + page + "'. The correct value should be between 0 and " + totalPages + ".";
        },
        incorrectStateObjType: "The input parameter 'state' is incorrect. It should be an object."
      }
    };

    /**
     * Checks input state parameter to contain read only properties. If contains, it throws an exception.
     *
     * @name PromptPanel#_validateReadOnlyState
     * @method
     * @private
     * @param  {Object} state The set of properties
     * @throws {Error}        Exception if input state parameter contains read only properties
     */
    var _validateReadOnlyState = function(state) {
      var cantModify = _STATE_CONSTANTS.readOnlyProperties.some(function(item) {
        return state.hasOwnProperty(item);
      });
      if (cantModify) {
        throw new Error(_STATE_CONSTANTS.msgs.notChangeReadonlyProp(_STATE_CONSTANTS.readOnlyProperties));
      }
    };

    /**
     * Checks input value as boolean type.
     *
     * @name PromptPanel#_validateBooleanState
     * @method
     * @private
     * @param  {String} name  The name of the state property
     * @param  {Object} value The value of the state property
     * @throws {Error}        Exception if input value is not a boolean type
     */
    var _validateBooleanState = function(name, value) {
      if (value != null && typeof value !== "boolean") {
        throw new Error(_STATE_CONSTANTS.msgs.incorrectBooleanType(name, value));
      }
    };

    /**
     * Validates property 'autoSubmit'.
     *
     * @name PromptPanel#_validateAutoSubmit
     * @method
     * @private
     * @param  {Boolean} autoSubmit      The value of the 'autoSubmit' property
     * @param  {Boolean} allowAutoSubmit The whether auto-submit is allowed
     * @throws {Error}                   Exception if type of 'autoSubmit' is incorrect or setting autoSubmit is not allowed
     */
    var _validateAutoSubmit = function(autoSubmit, allowAutoSubmit) {
      _validateBooleanState("autoSubmit", autoSubmit);
      if (autoSubmit != null && !allowAutoSubmit) {
        throw new Error(_STATE_CONSTANTS.msgs.notAllowedAutoSubmit);
      }
    };

    /**
     * Validates property 'page'.
     *
     * @name PromptPanel#_validateStatePage
     * @method
     * @private
     * @param {Number} page       The value of page
     * @param {Boolean} paginate  The whether pagination is active
     * @param {Number} totalPages The value of total pages
     * @throws {Error}            Exception if type of 'page' is incorrect or pagination is not activated or 'page' has incorrect value
     */
    var _validateStatePage = function(page, paginate, totalPages) {
      if (page != null) {
        if (typeof page !== "number") {
          throw new Error(_STATE_CONSTANTS.msgs.incorrectNumberType(page));
        }
        if (!paginate) {
          throw new Error(_STATE_CONSTANTS.msgs.paginationNotActivated(page));
        }
        if (page < 0 || page >= totalPages) {
          throw new Error(_STATE_CONSTANTS.msgs.incorrectPageValue(page, totalPages - 1));
        }
      }
    };

    /**
     * Validates all state's properties.
     *
     * @name PromptPanel#_validateState
     * @method
     * @private
     * @param  {Object} state                  The set of properties
     * @param  {ParameterDefinition} paramDefn The parameter definition instance
     * @throws {Error}                         Exception if input 'state' parameter is invalid
     */
    var _validateState = function(state, paramDefn) {
      if (!state || typeof state !== 'object') {
        throw new Error(_STATE_CONSTANTS.msgs.incorrectStateObjType);
      }
      _validateReadOnlyState(state);
      _validateBooleanState("parametersChanged", state.parametersChanged);
      _validateAutoSubmit(state.autoSubmit, paramDefn.allowAutoSubmit());
      _validateStatePage(state.page, paramDefn.paginate, paramDefn.totalPages);
    };

    var PromptPanel = Base.extend({
      paramDefn: undefined,
      parametersChanged: false,
      onParameterChanged: null,
      onBeforeRender: null,
      onAfterRender: null,
      onBeforeUpdate: null,
      onAfterUpdate: null,
      onStateChanged: null,
      onSubmit: null,

      /**
       * Constructor for the PromptPanel
       * Override to the Base constructor
       *
       * @name PromptPanel#constructor
       * @method
       * @param {String} destinationId The html id to place the prompt
       * @param {ParameterDefinition} paramDefn The parameter definition assigned to the prompt
       */
      constructor: function(destinationId, paramDefn) {
        if (!destinationId) {
          throw new Error('destinationId is required');
        }

        /**
         * The html id destination where the prompt will be rendered
         *
         * @name PromptPanel#destinationId
         * @type String
         * @default undefined
         */
        this.destinationId = destinationId;

        this.setParamDefn(paramDefn);

        this.renderEngine = new CdfRenderEngine(this.destinationId);

        this.paramDiffer = new ParamDiff();

        this.renderEngine.registerOnReady(this._ready.bind(this));
        this.renderEngine.registerOnSubmit(this._submit.bind(this));
        this.renderEngine.registerOnParameterChanged(this.parameterChanged.bind(this));
      },

      /**
       * Returns the parameter definition if it has been set. Otherwise an exception is thrown.
       *
       * @returns {Object}
       */
      getParamDefn: function() {
        if (!this.paramDefn) {
          throw new Error('paramDefn is required. Call PromptPanel#setParamDefn');
        }
        return this.paramDefn;
      },


      /**
       * Registers a post init event on the dashboard
       * @param {Function} callback The function to be executed when the event is triggered
       */
      onPostInit: function(callback) {
        this.renderEngine.registerOnPostInit(callback);
      },

      /**
       * Sets the parameter definition for the prompt panel. Also sets whether the prompt panel has auto submit
       * @param paramDefn {Object} The parameter definition object
       */
      setParamDefn: function(paramDefn) {
        var prevParamDefn = this.paramDefn;
        this.paramDefn = paramDefn;

        var fireStateChanged = function(paramName, oldParamDefn, newParamDefn, getValueCallback) {
          if (this.onStateChanged == null) {
            return;
          }

          var oldVal = oldParamDefn ? getValueCallback(oldParamDefn) : undefined;
          var newVal = newParamDefn ? getValueCallback(newParamDefn) : undefined;

          if (oldVal != newVal) {
            this.onStateChanged(paramName, oldVal, newVal);
          }
        }.bind(this);

        if (paramDefn) {
          if (this.renderEngine.getAutoSubmit() == undefined) {
            this.setAutoSubmit(paramDefn.allowAutoSubmit());
          }

          fireStateChanged("promptNeeded", prevParamDefn, this.paramDefn, function(paramDefn) {
            return paramDefn.promptNeeded;
          });
          fireStateChanged("paginate", prevParamDefn, this.paramDefn, function(paramDefn) {
            return paramDefn.paginate;
          });
          fireStateChanged("totalPages", prevParamDefn, this.paramDefn, function(paramDefn) {
            return paramDefn.totalPages;
          });
          fireStateChanged("showParameterUI", prevParamDefn, this.paramDefn, function(paramDefn) {
            return paramDefn.showParameterUI();
          });
          fireStateChanged("allowAutoSubmit", prevParamDefn, this.paramDefn, function(paramDefn) {
            return paramDefn.allowAutoSubmit();
          });
          fireStateChanged("page", prevParamDefn, this.paramDefn, function(paramDefn) {
            return paramDefn.page;
          });
        }
      },

      /**
       * Sets the autoSubmit property on the PromptPanel
       *
       * @param autoSubmit {Boolean} The autoSubmit boolean
       */
      setAutoSubmit: function(autoSubmit) {
        var prevVal = this.renderEngine.getAutoSubmit();
        this.renderEngine.setAutoSubmit(autoSubmit);

        if (this.onStateChanged != null && prevVal != autoSubmit) {
          this.onStateChanged("autoSubmit", prevVal, autoSubmit);
        }
      },

      /**
       * Returns a map of parameter name value. This will extract the current parameter value from the dashboard
       * instance as necessary
       *
       * @name PromptPanel#getParameterValues
       * @method
       * @returns {Object} parameters The parameters name|value pair assigned to the dashboard instance
       */
      getParameterValues: function() {
        var params = {};
        this.getParamDefn().mapParameters(function(param) {
          var value = this.getParameterValue(param);
          if (value === '' || typeof value == 'undefined') {
            return;
          }
          if (param.multiSelect && !$.isArray(value)) {
            value = [value];
          }
          if (Utils.isNumberType(param.type)) {
            var localization = i18n.getLocalization("dojo.cldr", "number", SESSION_LOCALE.toLowerCase());
            var defaultLocalization = i18n.getLocalization("dojo.cldr", "number", null);
            var valueParsed;
            try {
              if (value.indexOf(localization ? localization.decimal : defaultLocalization.decimal) > 0) {
                valueParsed = DojoNumber.parse(value, {
                  locale: SESSION_LOCALE.toLowerCase()
                });
                if (valueParsed.toString().indexOf(defaultLocalization.decimal) < 0) {
                  valueParsed = DojoNumber.format(valueParsed, {
                    places: value.length - value.indexOf(localization ? localization.decimal : defaultLocalization.decimal) - 1
                  });
                  defaultLocalization = i18n.getLocalization("dojo.cldr", "number", null);
                  valueParsed = valueParsed.split(defaultLocalization.group).join("");
                }
              } else {
                valueParsed = DojoNumber.parse(value, {
                  locale: SESSION_LOCALE.toLowerCase()
                });
              }
            } catch (e) {
              valueParsed = value;
            }
          }
          params[param.name] = isNaN(valueParsed) ? value : valueParsed;
        }, this);
        return params;
      },

      /**
       * Sets the parameter value in the dashboard instance parameter map
       *
       * @name PromptPanel#setParameterValue
       * @method
       * @param {Parameter} param The name of the parameter
       * @param {Object} value The value of the parameter
       */
      setParameterValue: function(param, value) {
        this.renderEngine.setParameterValue(param, value);
      },

      /**
       * Gets the parameter value from the dashboard instance parameter map
       *
       * @name PromptPanel#getParameterValue
       * @method
       * @param {Parameter} param The parameter name
       * @returns {Object} The parameter value stored in the dashboard instance
       */
      getParameterValue: function(param) {
        return this.renderEngine.getParameterValue(param);
      },

      /**
       * Called by the prompt-panel component when the CDE components have been updated.
       *
       * @name PromptPanel#_ready
       * @method
       * @private
       */
      _ready: function() {
        this.ready(this);
      },

      /**
       * Called when the prompt-panel component's submit button is clicked or auto-submit is enabled and a parameter
       * value changes.
       *
       * @name PromptPanel#_submit
       * @method
       * @param {Object}  [options]        Additional configuration options.
       * @param {Boolean} [options.isInit] Flag indicating if submit is being executed during initialization.
       * @private
       */
      _submit: function(options) {
        this.submit(this, options);
      },

      /**
       * Called by the prompt-panel component when the CDE components have been updated.
       *
       * @name PromptPanel#ready
       * @method
       * @param {PromptPanel} promptPanel
       */
      ready: function(promptPanel) {},

      /**
       * Called when the prompt-panel component's submit button is clicked or auto-submit is enabled and a parameter
       * value changes.
       *
       * @name PromptPanel#submit
       * @method
       * @param {PromptPanel} promptPanel  A prompt panel whose settings should be used for configuration purposes.
       * @param {Object}  [options]        Additional configuration options.
       * @param {Boolean} [options.isInit] Flag indicating if submit is being executed during initialization.
       */
      submit: function(promptPanel, options) {
        if (this.onSubmit) {
          if (typeof this.onSubmit === "function") {
            this.onSubmit(options);
          } else {
            Logger.warn("The onSubmit event callback is not a function");
          }
        }
      },

      /**
       * Called when a parameter value changes.
       *
       * The current implementation of  WidgetBuilder#build hooks
       * a method to the "postChange" CDF method of just built widgets
       * that have a "parameter".
       * This method calls its PromptPanel's "parameterChanged" method.
       *
       * @name PromptPanel#parameterChanged
       * @method
       * @param {Parameter} param
       * @param {String} name
       * @param {Object} value
       */
      parameterChanged: function(param, name, value) {
        if (this.onParameterChanged) {
          var paramCallback = this.onParameterChanged[name] ?
            this.onParameterChanged[name] :
            this.onParameterChanged[''];
          if (paramCallback) {
            if (typeof paramCallback === 'function') {
              paramCallback(name, value);
            } else {
              Logger.warn("The parameterChanged callback for '" + name + "' is not a function");
            }
          }
        }

        if (param.list && (!value || value == "" || value == "null")) {
          if (!this.nullValueParams) {
            this.nullValueParams = [];
          }

          this.nullValueParams.push(param);
        }

        this._setTimeoutRefreshPrompt();
        this.parametersChanged = true;

        if (this.onStateChanged != null) {
          this.onStateChanged("parametersChanged", false, this.parametersChanged);
        }
      },

      /**
       * Method called to sync the refresh of the prompt with the renderer calling a setTimeout 0
       *
       * @name PromptPanel#_setTimeoutRefreshPrompt
       * @method
       * @private
       *
       */
      _setTimeoutRefreshPrompt: function() {
        var myself = this;
        setTimeout(function() {
          myself.refreshPrompt()
        }, 0);
      },

      /**
       * This is called to refresh the prompt panel.
       * It should return a new parameter definition.
       * If it returns undefined no update will happen
       *
       * This method should be overridden.
       * The default implementation simply calls the provided callback with no parameter definition.
       *
       * @name PromptPanel#getParameterDefinition
       * @method
       * @param {PromptPanel} promptPanel the panel that needs a new parameter definition
       * @param {Function} callback function to call when the parameter definition has been fetched.
       *
       * The callback signature is: <pre>void function([newParamDef=undefined])</pre> and is called in the global context.
       */
      getParameterDefinition: function(promptPanel, callback) {
        callback();
      },

      /**
       * Called to refresh the prompt panel. This will invoke getParameterDefinition() to get a new parameter definition.
       * If the new parameter definition is undefined (default impl) no re-initialization will be done.
       *
       * @name PromptPanel#refreshPrompt
       * @param {Boolean} isForceRefresh The flag indicates ability to update all components regardless of the difference previos and new xml from server
       * @method
       */
      refreshPrompt: function(isForceRefresh) {
        try {
          this.isForceRefresh = isForceRefresh;
          this.getParameterDefinition(this, this.refresh.bind(this));
        } catch (e) {
          this.isForceRefresh = undefined;
          console.log(e);
          alert('Exception caught attempting to execute refreshCallback');
        }
      },

      /**
       * Refreshes the prompt panel with a given parameter definition.
       *
       * @name PromptPanel#refresh
       * @method
       * @param {ParameterDefinition} paramDefn the parameter definition used to refresh the prompt panel.
       * When unspecified, nothing is done.
       */
      refresh: function(paramDefn) {
        var myself = this;
        // Should really throw an error? Or return?
        /*if (this.dashboard.waitingForInit && this.dashboard.waitingForInit.length) {
          Logger.warn("Overlapping refresh!");
          setTimeout(function () {
            myself.refresh(paramDefn);
          }, 0);
          return;
        }*/

        if (paramDefn) {
          this.diff = this.paramDiffer.diff(this.getParamDefn(), paramDefn, this.nullValueParams);
          this.isRefresh = true;
          this.setParamDefn(paramDefn);
          this.nullValueParams = null;
          this.init();
        }
      },

      /**
       * Updates the dashboard and prompt panel based off of differences in the parameter definition
       *
       * @method update
       * @param {JSON} diff - contains the differences between the old and new parameter definitions produced by ParameterDefinitionDiffer.diff
       */
      update: function(diff) {
        var toRemove = Object.keys(diff.toRemove).length > 0,
          toAdd = Object.keys(diff.toAdd).length > 0,
          toChangeData = Object.keys(diff.toChangeData).length > 0;

        if ((toRemove || toAdd || toChangeData) && this.onBeforeRender) {
          this.onBeforeRender();
        }

        // Determine if there are params which need to be removed
        if (toRemove) {
          this.renderEngine._removeComponentsByDiff(this.getParamDefn(), diff.toRemove);
        }

        // Determine if there are params which need to be added
        if (toAdd) {
          this.renderEngine._addComponentsByDiff(this.getParamDefn(), diff.toAdd);
        }

        // Determine if there are params which need to be changed
        if (toChangeData) {
          this.renderEngine._changeComponentsByDiff(this.getParamDefn(), diff.toChangeData);
        }

        if ((toRemove || toAdd || toChangeData) && this.onAfterRender) {
          this.onAfterRender();
        }
      },

      /**
       * Initialize this prompt panel.
       * This will create the components and pass them to CDF to be loaded.
       *
       * @name PromptPanel#init
       * @method
       */
      init: function() {
        if (this.onBeforeUpdate) {
          this.onBeforeUpdate();
        }

        var paramDefn = this.getParamDefn();
        if (!this.isRefresh && paramDefn.showParameterUI()) { // First time init
          if (this.onBeforeRender) {
            this.onBeforeRender();
          }

          this.renderEngine.createPromptPanel(paramDefn);

          if (this.onAfterRender) {
            this.onAfterRender();
          }
        } else if (this.diff) { // Perform update when there are differences
          this.update(this.diff);
          if (this.isForceRefresh) {
            this.renderEngine.updatePromptPanel(paramDefn);
          }
        }

        this.diff = null;
        this.isRefresh = null;
        this.isForceRefresh = undefined;

        if (this.onAfterUpdate) {
          this.onAfterUpdate();
        }
      },

      /**
       * Makes visible the progress indicator by calling the function Dashboard#showProgressIndicator.
       *
       * @name PromptPanel#showProgressIndicator
       * @method
       */
      showProgressIndicator: function() {
        this.renderEngine.showProgressIndicator();
      },

      /**
       * Hides the progress indicator by calling the function Dashboard#hideProgressIndicator.
       *
       * @name PromptPanel#hideProgressIndicator
       * @method
       */
      hideProgressIndicator: function() {
        this.renderEngine.hideProgressIndicator();
      },

      /**
       * Sets the default options for blockUI
       *
       * @name PromptPanel#setBlockUiOptions
       * @method
       * @param {Object} options - The options to configure the block ui
       * @param {string} options.message - The message or html to display on block ui
       * @param {Object} options.css - A json that accepts valid css key/value pairs
       * @param {Object} options.overlayCSS - A json that accepts valid css key/value pairs for the block ui overlay
       * @param {boolean} options.showOverlay - Allows you to show or hide the overlay on block ui
       * @example
       *      var defaults = {
       *          message : '',
       *          css : {
       *              left : '0%',
       *              top : '0%',
       *              marginLeft : '85px',
       *              width : '100%',
       *              height : '100%',
       *              opacity : '1',
       *              backgroundColor : '#ffffcc'
       *          },
       *          overlayCSS : {
       *              backgroundColor : '#000000',
       *              opacity : '0.6',
       *              cursor : 'wait'
       *          },
       *          showOverlay : false
       *      };
       *      promptPanel.setBlockUiOptions(defaults);
       */
      setBlockUiOptions: function(options) {
        this.renderEngine.setBlockUiOptions(options);
      },

      /**
       * Gets a current state of the prompting system.
       *
       * @name PromptPanel#getState
       * @method
       * @returns {Object} The current state which consists of the next properties:
       *                   <ul>
       *                     <li>'promptNeeded' &lt;Boolean&gt; - True if prompts are needed, False otherwise (read only property)</li>
       *                     <li>'paginate' &lt;Boolean&gt; - True if pagination is active, False otherwise (read only property)</li>
       *                     <li>'totalPages' &lt;Number&gt; - The number of total pages of the report (read only property)</li>
       *                     <li>'showParameterUI' &lt;Boolean&gt; - The boolean value of the parameter ShowParameters (read only property)</li>
       *                     <li>'allowAutoSubmit' &lt;Boolean&gt; - The value of autoSubmit, or if it is undefined the value of autoSubmitUI (read only property)</li>
       *                     <li>'parametersChanged' &lt;Boolean&gt; - True if the parameters have changed, False otherwise</li>
       *                     <li>'autoSubmit' &lt;Boolean&gt; - True is the prompt is in auto submit mode, False otherwise</li>
       *                     <li>'page' &lt;Number&gt; - The number of the page</li>
       *                   </ul>
       * @example
       * var currentState = api.operation.state();
       * // Return value:
       * //   {
       * //     "promptNeeded":false,
       * //     "paginate":true,
       * //     "totalPages":10,
       * //     "showParameterUI":true,
       * //     "allowAutoSubmit":false,
       * //     "parametersChanged":false,
       * //     "autoSubmit":false,
       * //     "page":1
       * //   }
       */
      getState: function() {
        var paramDefn = this.getParamDefn();
        var result = {
          promptNeeded: paramDefn.promptNeeded,
          paginate: paramDefn.paginate,
          totalPages: paramDefn.totalPages,
          showParameterUI: paramDefn.showParameterUI(),
          allowAutoSubmit: paramDefn.allowAutoSubmit(),
          parametersChanged: this.parametersChanged,
          autoSubmit: this.renderEngine.getAutoSubmit(),
          page: paramDefn.page
        };
        return result;
      },

      /**
       * Modifys a state of the prompting system.
       *
       * @name PromptPanel#setState
       * @method
       * @param {Object} state                      The set of flags which will be applied to current state.
       * @param {Boolean} [state.parametersChanged] True if the parameters have changed, False otherwise
       * @param {Boolean} [state.autoSubmit]        True is the prompt is in auto submit mode, False otherwise. It's limited by the 'allowAutoSubmit' flag
       * @param {Number} [state.page]               The number of the current page. It's limited in range by the 'totalPages' and 'paginate' flags
       * @throws {Error} Exception if input 'state' parameter is invalid
       * @example
       * var state = {
       *   "parametersChanged":true,
       *   "autoSubmit":true,
       *   "page":5
       * };
       *
       * var updatedState = api.operation.state(state);
       * // Return value:
       * //   {
       * //     "promptNeeded":false,
       * //     "paginate":true,
       * //     "totalPages":10,
       * //     "showParameterUI":true,
       * //     "allowAutoSubmit":true,
       * //     "parametersChanged":true,
       * //     "autoSubmit":true,
       * //     "page":5
       * //   }
       */
      setState: function(state) {
        var paramDefn = this.getParamDefn();
        _validateState(state, paramDefn);

        if (state.parametersChanged != null) {
          if (this.onStateChanged != null && this.parametersChanged != state.parametersChanged) {
            this.onStateChanged("parametersChanged", this.parametersChanged, state.parametersChanged);
          }
          this.parametersChanged = state.parametersChanged;
        }

        (state.autoSubmit != null) && this.renderEngine.setAutoSubmit(state.autoSubmit);
        (state.page != null) && (paramDefn.page = state.page);
        this.setParamDefn(paramDefn);
      }
    });

    return PromptPanel;
  });