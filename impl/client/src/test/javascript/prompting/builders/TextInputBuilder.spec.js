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
define([
  "common-ui/prompting/builders/TextInputBuilder",
  "dojo/number",
  "common-ui/jquery-clean"
], function(TextInputBuilder, DojoNumber, $) {

  describe("TextInputBuilder", function() {

    var args = {
      promptPanel: {
        generateWidgetGUID: function() { return "12345"; },
        getParameterName: function() { }
      },
      param:  {
        values: { },
        attributes: { }
      }
    };

    var textInputBuilder;
    var component;
    var ph;

    beforeEach(function() {
      textInputBuilder = new TextInputBuilder();
      spyOn(textInputBuilder, "_createFormatter").and.returnValue(null);
      spyOn(textInputBuilder, "_createDataTransportFormatter").and.returnValue(null);

      component = textInputBuilder.build(args);
      expect(component.addClearIcon).not.toBeDefined();
      expect(component.clearIconClassName).not.toBeDefined();
      expect(component.refreshOnEveryKeyUp).not.toBeDefined();

      ph = $("<div>").attr("id", component.htmlObject);
      $("body").append(ph);
    });

    afterEach(function() {
      ph.remove();
    });

    it("should throw an error building component with no parameters", function() {
      expect(textInputBuilder.build).toThrow();
    });

    it("should return a TextInputComponent", function() {
      expect(component.type).toBe("TextInputComponent");
    });

    it("should set parameter on prechange", function() {
      var parameterValue = "test";
      component.dashboard = {
        setParameter: function() { },
        getParameterValue: function() { return parameterValue; }
      };

      component.update();
      spyOn(component.dashboard, "setParameter");
      spyOn(DojoNumber, "parse").and.callFake(function() { });
      component.preChange();
      expect(component.dashboard.setParameter).toHaveBeenCalled();
    });

    it("should set element value with text parameter", function() {
      component.param.values = [
        {
          label: "param1",
          selected: true
        }
      ];
      var parameterValue = "test";
      component.dashboard = {
        setParameter: function() { },
        getParameterValue: function() { return parameterValue; }
      };

      component.update();
      spyOn($.fn, "val").and.callThrough();
      component.postExecution();
      expect($.fn.val).toHaveBeenCalled();
    });

    it("should set element value with text parameter and no selected value", function() {
      component.param.values = [
        {
          label: "param1",
          value: "param1",
          selected: false
        }
      ];
      var parameterValue = "test";
      component.dashboard = {
        setParameter: function() { },
        getParameterValue: function() { return parameterValue; }
      };

      component.update();
      spyOn($.fn, "val").and.callThrough();
      component.postExecution();
      expect($.fn.val).toHaveBeenCalled();
    });

    it("should set element value with number parameter and with type defined", function() {
      parameterLabel = "1234";
      component.param.values = [
        {
          label: parameterLabel,
          value: parameterLabel,
          selected: true,
          type: "java.lang.Integer"
        }
      ];
      var parameterValue = "test";
      component.dashboard = {
        setParameter: function() { },
        getParameterValue: function() { return parameterValue; }
      };
      spyOn(DojoNumber, "format").and.callFake(function(val) { return val; });

      component.update();
      spyOn($.fn, "val").and.callThrough();
      component.postExecution();
      expect($.fn.val).toHaveBeenCalledWith("1234");
    });

    it("should set element value with number parameter and with type not defined", function() {
      parameterLabel = "1234";
      component.param.values = [
        {
          label: parameterLabel,
          value: parameterLabel,
          selected: true
        }
      ];
      var parameterValue = "test";
      component.dashboard = {
        setParameter: function() { },
        getParameterValue: function() { return parameterValue; }
      };

      component.update();
      spyOn($.fn, "val").and.callThrough();
      component.postExecution();
      expect($.fn.val).toHaveBeenCalledWith("1234");
    });

    it("should return cached text input component", function() {
      var extendedArgs = {
        promptPanel: {
          generateWidgetGUID: function() { return "000"; },
          getParameterName: function() { }
        },
        param: {
          values: { },
          attributes: {
            addClearIcon: true,
            clearIconClassName: "test-name",
            refreshOnEveryKeyUp: true,
            cacheComponent: true
          }
        }
      };
      component = textInputBuilder.build(extendedArgs);
      expect(component.addClearIcon).toBe(true);
      expect(component.clearIconClassName).toBe("test-name");
      expect(component.refreshOnEveryKeyUp).toBe(true);

      component.dashboard = {
        setParameter: jasmine.createSpy("setP"),
        components: [component]
      };
      spyOn(DojoNumber, "parse").and.callFake(function() { });
      component.preChange();

      var cachedComponent = textInputBuilder.build(extendedArgs);
      expect(cachedComponent).toBe(component);
    });
  });
});
