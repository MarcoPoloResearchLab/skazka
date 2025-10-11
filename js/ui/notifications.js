// @ts-check

export function createNotifications(){
  return {
    items: [],
    add(detail){
      if (!detail || typeof detail.message !== 'string') {
        return;
      }
      const id = Date.now() + Math.random();
      this.items.push({
        id,
        level: detail.level || 'info',
        message: detail.message,
      });
      window.setTimeout(() => {
        this.dismiss(id);
      }, 6000);
    },
    dismiss(id){
      this.items = this.items.filter((item) => item.id !== id);
    }
  };
}
