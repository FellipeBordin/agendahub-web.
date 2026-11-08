self.addEventListener("push", (event) => {
    let payload = {};

    if (event.data) {
        try {
            payload = event.data.json() ?? {};
        } catch {
            payload = {};
        }
    }

    const notificationId =
        typeof payload.notificationId === "number" &&
            Number.isSafeInteger(payload.notificationId) &&
            payload.notificationId > 0
            ? payload.notificationId
            : undefined;

    event.waitUntil(
        self.registration.showNotification("AgendaHub", {
            body: "Você recebeu uma nova reserva. Abra sua agenda para conferir.",
            tag: notificationId
                ? `agendahub-notification-${notificationId}`
                : undefined,
            data: {
                url: "/",
            },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const targetUrl = new URL("/", self.location.origin).href;

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            const existingWindow = windows.find(
                (client) => new URL(client.url).origin === self.location.origin,
            );

            if (existingWindow) {
                await existingWindow.focus();
                return;
            }

            await self.clients.openWindow(targetUrl);
        })(),
    );
});