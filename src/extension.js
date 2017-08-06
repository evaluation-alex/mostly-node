import _ from 'lodash';
import Co from 'co';
import Util from './util';

export default class Extension {

  constructor (type, options) {
    this._stack = [];
    this._type = type;
    this._options = options;
  }

  _add (handler) {
    if (this._options.generators && Util.isGeneratorFunction(handler)) {
      this._stack.push(function () {
        // -3 because (req, res, next, prevValue, index)
        const next = arguments[arguments.length - 3];
        return Co(handler.apply(this, arguments)).then(x => next(null, x)).catch(next);
      });
    } else {
      this._stack.push(handler);
    }
  }

  add (handler) {
    if (_.isArray(handler)) {
      handler.forEach(h => this._add(h));
    } else {
      this._add(handler);
    }
  }

  addRange (handlers) {
    this._stack = this._stack.concat(handlers);
  }

  dispatch (ctx, cb) {
    const each = (item, next, prevValue, i) => {
      if (this._options.server) {
        const response = ctx._response;
        const request = ctx._request;
        // pass next handler to response object so can abort with msg or error
        response.next = next;

        item.call(ctx, request, response, next, prevValue, i);
      } else {
        item.call(ctx, next, i);
      }
    };

    Extension.serial(this._stack, each, cb);
  }

  // unused function
  static parallel (array, method, callback) {
    if (!array.length) {
      callback();
    } else {
      let count = 0;
      let abort = false;
      let errored = false;

      const done = function (err, value, cancel) {
        if (!errored && !abort) {
          if (err) {
            errored = true;
            callback(err);
          } else if (value && cancel) {
            abort = true;
            callback(null, value);
          } else {
            count = count + 1;
            if (count === array.length) {
              callback(null, value);
            }
          }
        }
      };

      for (let i = 0; i < array.length; ++i) {
        method(array[i], done, i);
      }
    }
  }

  static serial (array, method, callback) {
    if (!array.length) {
      callback();
    } else {
      let i = 0;

      const iterate = function iterate(prevValue) {
        const done = function (err, value, abort) {
          if (err) {
            callback(err);
          } else if (value && abort) {
            callback(null, value);
          } else {
            i = i + 1;

            if (i < array.length) {
              iterate(value);
            } else {
              callback(null, value);
            }
          }
        };

        method(array[i], done, prevValue, i);
      };

      iterate();
    }
  }
}
