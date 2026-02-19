/**
 * state.js — Store centralizado con pub/sub simple
 *
 * Uso:
 *   import Store from './state.js';
 *   Store.set('mesas', { 1: {...} });
 *   Store.on('mesas', (value) => renderMesas(value));
 *   const mesas = Store.get('mesas');
 */

const Store = (() => {
  const _state = {
    sesion:    null,
    mesas:     {},
    productos: [],
    historial: [],
    usuarios:  [],
    actividad: []
  };

  const _listeners = {};

  return {
    get(key) {
      return _state[key];
    },

    set(key, value) {
      _state[key] = value;
      (_listeners[key] || []).forEach(fn => {
        try { fn(value); }
        catch (e) { console.error(`Store listener error [${key}]:`, e); }
      });
    },

    /** Actualiza parcialmente un objeto en el estado */
    patch(key, partial) {
      const current = _state[key];
      if (typeof current === 'object' && !Array.isArray(current)) {
        this.set(key, { ...current, ...partial });
      } else {
        this.set(key, partial);
      }
    },

    on(key, fn) {
      if (!_listeners[key]) _listeners[key] = [];
      _listeners[key].push(fn);
      // Retorna función de cleanup
      return () => {
        _listeners[key] = _listeners[key].filter(f => f !== fn);
      };
    },

    off(key, fn) {
      if (_listeners[key]) {
        _listeners[key] = _listeners[key].filter(f => f !== fn);
      }
    }
  };
})();

export default Store;
