package app.saldoza.budget;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private ImageView splash;

    @Override
    public void onCreate(Bundle state) {
        registerPlugin(BudgetBackup.class);
        super.onCreate(state);
    }

    @Override
    protected void load() {
        FrameLayout content = findViewById(android.R.id.content);
        splash = new ImageView(this);
        splash.setImageResource(R.drawable.saldoza_splash);
        splash.setScaleType(ImageView.ScaleType.FIT_CENTER);
        splash.setBackgroundColor(getResources().getColor(R.color.saldoza_launch_background, getTheme()));
        splash.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        content.addView(splash, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        // Keep the branding visible until the first loaded page can be drawn.
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                view.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        hideSplash(content);
                    }
                });
            }
        });
        splash.postDelayed(() -> hideSplash(content), 4000);
        super.load();
    }

    private void hideSplash(FrameLayout content) {
        if (splash == null) return;
        content.removeView(splash);
        splash = null;
    }
}
