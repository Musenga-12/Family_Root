import { createContext, useContext } from "react";

export const ModalContext = createContext(null);
export const CloseContext = createContext(() => {});

export const useModal = () => useContext(ModalContext);
export const useCloseModal = () => useContext(CloseContext);
