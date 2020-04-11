// *Disables CSS transitions until page has loaded*
$(window).on('load', function () {
    $("body").removeClass("preload");
});