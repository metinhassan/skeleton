/**
 * Toast Notification Component
 * Singleton manager for displaying toast notifications
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  element: HTMLElement;
}

class ToastManager {
  private static instance: ToastManager;
  private container: HTMLElement | null = null;
  private toasts: ToastItem[] = [];
  private idCounter = 0;

  private constructor() {
    this.createContainer();
  }

  static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  private createContainer(): void {
    // Check if container already exists
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    this.container = container;
  }

  show(options: ToastOptions): string {
    const id = `toast-${++this.idCounter}`;
    const type = options.type || 'info';
    const duration = options.duration ?? 3000;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast__icon">${this.getIcon(type)}</span>
      <span class="toast__message">${this.escapeHtml(options.message)}</span>
      <button class="toast__close" aria-label="Close">&times;</button>
    `;

    // Add click to dismiss
    const closeBtn = toast.querySelector('.toast__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.dismiss(id));
    }

    this.container?.appendChild(toast);

    const toastItem: ToastItem = { id, message: options.message, type, element: toast };
    this.toasts.push(toastItem);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast--visible');
    });

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  dismiss(id: string): void {
    const index = this.toasts.findIndex((t) => t.id === id);
    if (index === -1) return;

    const toast = this.toasts[index];
    toast.element.classList.remove('toast--visible');
    toast.element.classList.add('toast--hiding');

    setTimeout(() => {
      toast.element.remove();
      this.toasts.splice(index, 1);
    }, 300);
  }

  success(message: string, duration?: number): string {
    return this.show({ message, type: 'success', duration });
  }

  error(message: string, duration?: number): string {
    return this.show({ message, type: 'error', duration: duration ?? 5000 });
  }

  info(message: string, duration?: number): string {
    return this.show({ message, type: 'info', duration });
  }

  warning(message: string, duration?: number): string {
    return this.show({ message, type: 'warning', duration });
  }

  private getIcon(type: ToastType): string {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export singleton instance
export const toast = ToastManager.getInstance();
