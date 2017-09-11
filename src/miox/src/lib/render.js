/**
 * Created by evio on 2017/8/29.
 */
import renderWebViewWithAnimate from './animate';

/**
 * webview渲染方法
 * @param app
 * @param engine
 * @param webview
 * @param data
 * @returns {Promise.<null>}
 */
export default async (app, engine, webview, data) => {
    const pathname = app.req.pathname;
    const action = app.history.action;
    const mark = app.options.strict ? app.req.mark : pathname;
    const existsWebViewConfigs = app.get('exists-webview');

    const webViews = {
        existsWebView: existsWebViewConfigs
            ? existsWebViewConfigs.basic.dic.get(existsWebViewConfigs.mark)
            : null,
        activeWebView: null
    };

    if (action === 'replace' && !webViews.existsWebView) {
        throw new Error('replace method need a existing webview');
    }

    defineWebViewElementGetter(webViews, 'existsWebView');
    defineWebViewElementGetter(webViews, 'activeWebView');

    Object.defineProperty(webViews, 'existWebViewIndex', {
        get() {
            if (webViews.existsWebView) {
                return app.history.stacks.indexOf(webViews.existsWebView);
            }
            return -1;
        }
    });

    const oldCacheWebViewConstructor = app.cache.get(pathname);
    let oldCacheWebView, pushWebViewExtras, remindExtra, newCacheWebView = webview.dic.get(mark);

    if (!newCacheWebView) {
        newCacheWebView = await createNewCachedWebView(engine, webview, data, mark);
    }

    if (oldCacheWebViewConstructor) {
        oldCacheWebView = oldCacheWebViewConstructor.dic.get(mark);
    }

    const oldCacheChangeStatus = oldCacheWebViewConstructor && oldCacheWebViewConstructor !== webview && oldCacheWebView;
    app.cache.set(pathname, webview);
    app.log('Cache change status:', !!oldCacheChangeStatus);
    app.log('%c[Start]', 'color:#108ee9', 'History stacks:', app.history.stacks.slice(0));

    switch (action) {
        case 'push':
            pushWebViewExtras = app.history.stacks.slice(webViews.existWebViewIndex + 1);
            oldCacheChangeStatus && pushWebViewExtras.push(oldCacheWebView);
            app.log('%c[Action:Push]', 'color:#108ee9', 'Reduce stacks:', pushWebViewExtras.slice(0));
            destroyWebViews(app, pushWebViewExtras);
            if (pushWebViewExtras.indexOf(newCacheWebView) > -1) {
                newCacheWebView = await createNewCachedWebView(engine, webview, data, mark);
            }
            app.log('%c[Action:Push]', 'color:#108ee9', 'Add stacks:', newCacheWebView);
            app.history.stacks.push(newCacheWebView);
            break;
        case 'replace':
            if (oldCacheChangeStatus) {
                app.log('%c[Action:Replace]', 'color:#108ee9', 'Destroy stacks:', oldCacheWebView);
                destroyWebViews(app, oldCacheWebView);
            }
            app.log('%c[Action:Replace]', 'color:#108ee9', 'Reduce stacks:', webViews.existsWebView);
            app.log('%c[Action:Replace]', 'color:#108ee9', 'Add stacks:', newCacheWebView);
            destroyWebViews(app, webViews.existsWebView, newCacheWebView);
            break;
        default:
            if (oldCacheChangeStatus) {
                app.log('%c[Action:Any]', 'color:#108ee9', 'Reduce stacks:', oldCacheWebView);
                app.log('%c[Action:Any]', 'color:#108ee9', 'Add stacks:', newCacheWebView);
                destroyWebViews(app, oldCacheWebView, newCacheWebView);
            } else {
                if (app.history.stacks.indexOf(newCacheWebView) === -1) {
                    if (app.history.direction < 0) {
                        app.log('%c[Action:Any]', 'color:#108ee9', 'History back');
                        app.log('%c[Action:Any]', 'color:#108ee9', 'Insert stacks:', newCacheWebView, 'Position:', webViews.existWebViewIndex);
                        insertStacks(app, webViews.existWebViewIndex, newCacheWebView);
                    } else if (app.history.direction > 0) {
                        app.log('%c[Action:Any]', 'color:#108ee9', 'History forward');
                        app.log('%c[Action:Any]', 'color:#108ee9', 'Insert stacks:', newCacheWebView, 'Position:', webViews.existWebViewIndex + 1);
                        insertStacks(app, webViews.existWebViewIndex + 1, newCacheWebView);
                    } else {
                        app.log('%c[Action:Any]', 'color:#108ee9', 'History unknown');
                        app.log('%c[Action:Any]', 'color:#108ee9', 'Push stacks:', newCacheWebView);
                        app.history.stacks.push(newCacheWebView);
                    }
                }
            }
    }

    webViews.activeWebView = newCacheWebView;

    app.set('active-webview', {
        basic: webview,
        mark: mark
    });

    // SSR的client端渲染的时候，在没有mounted情况下，取不到节点；
    // 那么直接返回，不做任何动画。
    if (!webViews.activeWebViewElement) {
        app.log('%c[End:Install]', 'color:#108ee9', 'History stacks:', app.history.stacks.slice(0));
        return webViews.activeWebView;
    }

    // 动画渲染两个页面的家在过程。
    await renderWebViewWithAnimate(
        app,
        webViews.existsWebViewElement,
        webViews.activeWebViewElement
    );

    if (app.history.stacks.length > app.options.max) {
        app.log('%c[Action:Max]', 'color:#108ee9', 'Over max length', app.options.max);
        app.log('%c[Action:Queue]', 'color:#108ee9', 'Old queue', app.history.stacks.slice(0));
        if (action === 'push') {
            remindExtra = app.history.stacks[0];
        } else if (action !== 'replace') {
            if (app.history.direction >= 0) {
                remindExtra = app.history.stacks[0];
            } else {
                remindExtra = app.history.stacks[app.history.stacks.length - 1];
            }
        }
        destroyWebViews(app, remindExtra);
        app.log('%c[Action:Queue]', 'color:#108ee9', 'Delete', remindExtra);
        app.log('%c[Action:Queue]', 'color:#108ee9', 'Remind', app.history.stacks.slice(0));
    }

    app.log('%c[End]', 'color:#108ee9', 'History stacks:', app.history.stacks);

    return webViews.activeWebView;
}

function defineWebViewElementGetter(webViews, name) {
    Object.defineProperty(webViews, name + 'Element', {
        get() {
            if (this[name]) {
                return this[name].__MioxInjectElement__;
            }
        }
    });
}

function destroyWebViews(app, webviews, ...args) {
    if (!Array.isArray(webviews)) {
        webviews = [webviews];
    }
    let i = webviews.length;
    while (i--) {
        const webview = webviews[i];
        const index = app.history.stacks.indexOf(webview);
        if (index > -1) {
            app.history.stacks.splice(index, 1, ...args);
            webview.constructor.dic.del(webview.__MioxMark__);
            webview.MioxInjectDestroy();
        }
    }
}

function insertStacks(app, i, ...args) {
    const stacks = app.history.stacks;
    const left = stacks.slice(0, i);
    const right = stacks.slice(i);
    app.history.stacks = left.concat(args).concat(right);
}

async function createNewCachedWebView(engine, webview, data, mark) {
    const newCacheWebView = await engine.create(webview, data);
    newCacheWebView.__MioxMark__ = mark;
    webview.dic.set(mark, newCacheWebView);
    return newCacheWebView;
}