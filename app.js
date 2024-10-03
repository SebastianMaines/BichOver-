
// Esperar a que el documento esté completamente cargado
document.addEventListener('DOMContentLoaded', function () {

    // Configuración de Firebase
    const firebaseConfig = {


        apiKey: "AIzaSyAOAbpgX2VmylNbP6WRp9CwzLNq_8eVjZI",
        authDomain: "bichbye--piscinas.firebaseapp.com",
        databaseURL: "https://bichbye--piscinas-default-rtdb.firebaseio.com",
        projectId: "bichbye--piscinas",
        storageBucket: "bichbye--piscinas.appspot.com",
        messagingSenderId: "753158630879",
        appId: "1:753158630879:web:28e3a5799381153406286a"
    };

    // Inicializar Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Referencias a Firebase
    const db = firebase.database();

    // Variable para almacenar el usuario actual
    let currentUser = null;

    /*** AUTENTICACIÓN POR NOMBRE DE USUARIO Y CONTRASEÑA ***/
    // Usuarios predefinidos
    const usuarios = {
        'Seba': {
            username: 'Seba',
            password: 'Seba' // Cambia esto por la contraseña real
        },
        'Juan': {
            username: 'Juan',
            password: 'Juan' // Cambia esto por la contraseña real
        }
    };

    // Guardar los usuarios en Firebase (solo se hace una vez)
    // Comentamos esto después de la primera ejecución para evitar sobreescribir datos

    /*
    db.ref('usuarios/Seba').set(usuarios['Seba']);
    db.ref('usuarios/Juan').set(usuarios['Juan']);
    */

    // Manejar inicio de sesión
    document.getElementById('loginForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Obtener el usuario de Firebase
        db.ref('usuarios/' + username).once('value').then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.password === password) {
                    // Inicio de sesión exitoso
                    currentUser = {
                        username: userData.username
                    };
                    alert('Inicio de sesión exitoso');
                    showSection('gastos');
                    document.getElementById('user-username').textContent = currentUser.username;
                    cargarStock(); // Cargar stock al iniciar sesión
                } else {
                    alert('Contraseña incorrecta');
                }
            } else {
                alert('Nombre de usuario no encontrado');
            }
        });
    });

    // Manejar cierre de sesión
    document.getElementById('logout-btn').addEventListener('click', function () {
        currentUser = null;
        alert('Sesión cerrada');
        showSection('login');
        document.getElementById('user-username').textContent = '';
    });

    /*** FUNCIONES COMUNES ***/
    function getCurrentUser() {
        return currentUser;
    }

    function showSection(sectionId) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            section.style.display = 'none';
        });
        document.getElementById(sectionId).style.display = 'block';
    }

    // Mostrar sección de inicio de sesión al cargar la página
    showSection('login');

    /*** SECCIÓN DE GASTOS ***/
    // Función para registrar el gasto
    document.getElementById('gastosForm').addEventListener('submit', function (e) {
        e.preventDefault();

        

        const user = getCurrentUser();
        if (!user) return;

        // Obtener los valores del formulario
         const tipo = document.getElementById('tipo').value;
    const monto = parseFloat(document.getElementById('monto').value);
    const razon = document.getElementById('razon').value;

    let destinatario = null;
    if (tipo === 'transferencia') {
        destinatario = document.getElementById('destinatario').value;
    }

        // Crear el objeto gasto
        const gasto = {
            tipo: tipo,
            monto: monto,
            razon: razon,
            fecha: new Date().toLocaleString(),
            timestamp: new Date().getTime(),
            usuario: user.username,
            repartido: false
        };

        

        // Guardar el gasto en Firebase
        db.ref('gastos').push(gasto);

    if (tipo === 'transferencia' && destinatario) {
        actualizarGasto(user.username, -monto);
        actualizarGasto(destinatario, monto);
    } else {
        actualizarGasto(user.username, monto);
    }

        
        // Limpiar el formulario
        document.getElementById('gastosForm').reset();
    });
// Función para actualizar el gasto de cada usuario en Firebase
function actualizarGasto(usuario, monto) {
    const usuarioRef = db.ref('usuarios/' + usuario + '/gastos');
    usuarioRef.transaction(function (currentGastos) {
        return (currentGastos || 0) + monto;
    });}
    

    // Función para mostrar los gastos en tiempo real
    db.ref('gastos').on('value', (snapshot) => {
        const listaGastos = document.getElementById('listaGastos');
        if (!listaGastos) {
            console.error('Elemento con ID "listaGastos" no encontrado en el DOM.');
            return;
        }
        listaGastos.innerHTML = '';

        snapshot.forEach((childSnapshot) => {
            const gasto = childSnapshot.val();
            const key = childSnapshot.key;

            // Determinar si el gasto ha sido repartido
            const repartido = gasto.repartido === true;
            const claseRepartido = repartido ? 'repartido' : '';

            listaGastos.innerHTML += `
                <p class="${claseRepartido}">
                    ${gasto.fecha} - ${gasto.tipo}: $${gasto.monto.toFixed(2)} (${gasto.razon}) - Registrado por: ${gasto.usuario}
                    <button class="btn-eliminar" onclick="eliminarGasto('${key}')">Eliminar</button>
                </p>
            `;
        });
    });

    // Función para eliminar un gasto
    window.eliminarGasto = function (key) {
        if (confirm('¿Estás seguro de que deseas eliminar este gasto?')) {
            // Mover el gasto a 'gastosEliminados'
            db.ref('gastos/' + key).once('value').then((snapshot) => {
                const gastoEliminado = snapshot.val();
                gastoEliminado.eliminadoPor = getCurrentUser().username;
                gastoEliminado.fechaEliminacion = new Date().toLocaleString();
                db.ref('gastosEliminados').push(gastoEliminado);

                // Eliminar el gasto original
                db.ref('gastos/' + key).remove();
            });
        }
    };

    /*** SECCIÓN DE CLIENTES ***/
    // Función para agregar un cliente a Firebase
    document.getElementById('clientesForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        // Obtener los valores del formulario
        const razonSocial = document.getElementById('razonSocial').value;
        const localidad = document.getElementById('localidad').value;
        const direccion = document.getElementById('direccion').value;
        const telefono = document.getElementById('telefono').value;

        // Crear el objeto cliente
        const cliente = {
            razonSocial: razonSocial,
            localidad: localidad,
            direccion: direccion,
            telefono: telefono,
            cantidadFrascos: 0,
            fechaUltimaCompra: 'N/A',
            usuario: user.username,
            timestamp: new Date().getTime(),
            potencial: false, // Nuevo campo para marcar como cliente potencial
            frascosVerano2024: 0 // Campo para la cantidad de frascos comprados en verano 2024
        };

        // Guardar el cliente en Firebase
        db.ref('clientes').push(cliente);

        // Limpiar el formulario
        document.getElementById('clientesForm').reset();
    });

    // Manejar el cambio en el select de ordenamiento
    document.getElementById('sortSelect').addEventListener('change', function () {
        mostrarClientes();
    });

    // Función para mostrar la lista de clientes en tiempo real
    function mostrarClientes() {
        const sortBy = document.getElementById('sortSelect').value;

        db.ref('clientes').once('value', (snapshot) => {
            const clientesArray = [];
            snapshot.forEach((childSnapshot) => {
                const cliente = childSnapshot.val();
                cliente.key = childSnapshot.key; // Agregar la clave al objeto cliente
                clientesArray.push(cliente);
            });

            // Ordenar el array según la opción seleccionada
            clientesArray.sort((a, b) => {
                if (a[sortBy] < b[sortBy]) return -1;
                if (a[sortBy] > b[sortBy]) return 1;
                return 0;
            });

            const clientesBody = document.getElementById('clientesBody');
            if (!clientesBody) {
                console.error('Elemento con ID "clientesBody" no encontrado en el DOM.');
                return;
            }
            clientesBody.innerHTML = '';

            clientesArray.forEach((cliente) => {
                const key = cliente.key;

                // Crear una nueva fila para cada cliente con opciones adicionales
                const row = `
                    <tr>
                        <td>${cliente.razonSocial}</td>
                        <td>${cliente.localidad}</td>
                        <td>${cliente.direccion}</td>
                        <td>${cliente.telefono}</td>
                        <td>${cliente.cantidadFrascos}</td>
                        <td>${cliente.fechaUltimaCompra}</td>
                        <td>
                            <input type="checkbox" ${cliente.potencial ? 'checked' : ''} onchange="marcarCliente('${key}', this.checked)">
                        </td>
                        <td>
    <button class="btn-editar" onclick="editarCliente('${key}')">Editar</button>
    <button class="btn-eliminar" onclick="eliminarCliente('${key}')">Eliminar</button>
</td>
                    </tr>
                `;
                clientesBody.innerHTML += row;
            });
        });
    }

    // Llamar a la función al cargar la página y al agregar un nuevo cliente
    mostrarClientes();
    db.ref('clientes').on('value', mostrarClientes);

    // Función para marcar o desmarcar un cliente como potencial
    window.marcarCliente = function (key, isChecked) {
        db.ref('clientes/' + key).update({ potencial: isChecked });
        mostrarClientesPotenciales(); // Actualizar la lista de clientes potenciales
    };

    // Función para editar un cliente
    window.editarCliente = function (key) {
        // Obtener los datos actuales del cliente
        db.ref('clientes/' + key).once('value').then((snapshot) => {
            const cliente = snapshot.val();
            // Rellenar el formulario con los datos actuales
            document.getElementById('razonSocial').value = cliente.razonSocial;
            document.getElementById('localidad').value = cliente.localidad;
            document.getElementById('direccion').value = cliente.direccion;
            document.getElementById('telefono').value = cliente.telefono;

            // Cambiar el botón para indicar que estamos editando
            const clientesForm = document.getElementById('clientesForm');
            clientesForm.dataset.editing = key;
            clientesForm.querySelector('button').textContent = 'Actualizar Cliente';
        });
    };

    // Actualizar o agregar cliente al enviar el formulario
    document.getElementById('clientesForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        // Obtener los valores del formulario
        const razonSocial = document.getElementById('razonSocial').value;
        const localidad = document.getElementById('localidad').value;
        const direccion = document.getElementById('direccion').value;
        const telefono = document.getElementById('telefono').value;

        const clientesForm = document.getElementById('clientesForm');
        const editingKey = clientesForm.dataset.editing;

        if (editingKey) {
            // Si estamos editando, actualizar el cliente existente
            db.ref('clientes/' + editingKey).update({
                razonSocial: razonSocial,
                localidad: localidad,
                direccion: direccion,
                telefono: telefono
            });
            // Limpiar el estado de edición
            delete clientesForm.dataset.editing;
            clientesForm.querySelector('button').textContent = 'Agregar Cliente';
        } else {
            // Si no estamos editando, agregar un nuevo cliente
            const cliente = {
                razonSocial: razonSocial,
                localidad: localidad,
                direccion: direccion,
                telefono: telefono,
                cantidadFrascos: 0,
                fechaUltimaCompra: 'N/A',
                usuario: user.username,
                timestamp: new Date().getTime(),
                potencial: false,
                frascosVerano2024: 0
            };
            db.ref('clientes').push(cliente);
        }

        // Limpiar el formulario
        document.getElementById('clientesForm').reset();
    });
    
    // Función para eliminar un cliente
    window.eliminarCliente = function (key) {
        if (confirm('¿Estás seguro de que deseas eliminar este cliente?')) {
            // Mover el cliente a 'clientesEliminados'
            db.ref('clientes/' + key).once('value').then((snapshot) => {
                const clienteEliminado = snapshot.val();
                clienteEliminado.eliminadoPor = getCurrentUser().username;
                clienteEliminado.fechaEliminacion = new Date().toLocaleString();
                db.ref('clientesEliminados').push(clienteEliminado);

                // Eliminar el cliente original
                db.ref('clientes/' + key).remove();
            });
        }
    };

    /*** SECCIÓN DE CLIENTES POTENCIALES ***/
    function mostrarClientesPotenciales() {
        db.ref('clientes').orderByChild('potencial').equalTo(true).once('value', (snapshot) => {
            const clientesPotencialesBody = document.getElementById('clientesPotencialesBody');
            if (!clientesPotencialesBody) {
                console.error('Elemento con ID "clientesPotencialesBody" no encontrado en el DOM.');
                return;
            }
            clientesPotencialesBody.innerHTML = '';

            snapshot.forEach((childSnapshot) => {
                const cliente = childSnapshot.val();
                const key = childSnapshot.key;

                const row = `
                    <tr>
                        <td>${cliente.razonSocial}</td>
                        <td>${cliente.localidad}</td>
                        <td>${cliente.direccion}</td>
                        <td>${cliente.telefono}</td>
                        <td>
                            <input type="number" value="${cliente.frascosVerano2024 || 0}" onchange="actualizarFrascosVerano('${key}', this.value)">
                        </td>
                        <td>
                            <button class="btn-editar" onclick="editarCliente('${key}')">Editar</button>
                            <button  class="btn-eliminar"onclick="eliminarCliente('${key}')">Eliminar</button>
                        </td>
                    </tr>
                `;
                clientesPotencialesBody.innerHTML += row;
            });
        });
    }

    // Llamar a la función al cargar la página y al cambiar el estado de los clientes
    mostrarClientesPotenciales();
    db.ref('clientes').on('value', mostrarClientesPotenciales);

    // Función para actualizar la cantidad de frascos comprados en verano 2024
    window.actualizarFrascosVerano = function (key, cantidad) {
        db.ref('clientes/' + key).update({ frascosVerano2024: parseInt(cantidad) });
    };

    /*** SECCIÓN DE VENTAS ***/
    // Cargar la lista de clientes en el select de ventas
    function cargarClientesEnVentas() {
        db.ref('clientes').once('value', (snapshot) => {
            const clienteSelect = document.getElementById('clienteVenta');
            if (!clienteSelect) {
                console.error('Elemento con ID "clienteVenta" no encontrado en el DOM.');
                return;
            }
            clienteSelect.innerHTML = ''; // Limpiar opciones previas

            snapshot.forEach((childSnapshot) => {
                const cliente = childSnapshot.val();
                const option = document.createElement('option');
                option.value = childSnapshot.key; // Usar la clave del cliente
                option.textContent = cliente.razonSocial;
                clienteSelect.appendChild(option);
            });
        });
    }

    // Llamar a la función al cargar la página y al agregar un nuevo cliente
    cargarClientesEnVentas();
    db.ref('clientes').on('value', cargarClientesEnVentas);

    // Función para registrar una venta
    document.getElementById('ventasForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        // Obtener los valores del formulario
        const clienteKey = document.getElementById('clienteVenta').value;
        const cantidadFrascos = parseInt(document.getElementById('cantidadVenta').value);
        const precioVenta = parseFloat(document.getElementById('precioVenta').value);
        const fechaVenta = new Date().toLocaleString();
        const timestamp = new Date().getTime();

        // Obtener la razón social del cliente
        db.ref('clientes/' + clienteKey).once('value').then((snapshot) => {
            const clienteData = snapshot.val();
            const clienteNombre = clienteData.razonSocial;

            // Crear el objeto venta
            const venta = {
                clienteKey: clienteKey,
                cliente: clienteNombre,
                cantidadFrascos: cantidadFrascos,
                precioVenta: precioVenta,
                fechaVenta: fechaVenta,
                timestamp: timestamp,
                usuario: user.username,
                repartido: false
            };

            // Guardar la venta en Firebase
            db.ref('ventas').push(venta);

            // Actualizar la información del cliente
            const nuevaCantidadFrascos = (clienteData.cantidadFrascos || 0) + cantidadFrascos;
            const updates = {
                cantidadFrascos: nuevaCantidadFrascos,
                fechaUltimaCompra: fechaVenta
            };
            db.ref('clientes/' + clienteKey).update(updates);

            // Actualizar el stock del usuario
            actualizarStockUsuario(user.username, -cantidadFrascos);

            // Limpiar el formulario
            document.getElementById('ventasForm').reset();
        });
    });

    // Función para mostrar las ventas en tiempo real
    db.ref('ventas').on('value', (snapshot) => {
        const ventasBody = document.getElementById('ventasBody');
        if (!ventasBody) {
            console.error('Elemento con ID "ventasBody" no encontrado en el DOM.');
            return;
        }
        ventasBody.innerHTML = '';

        snapshot.forEach((childSnapshot) => {
            const venta = childSnapshot.val();
            const key = childSnapshot.key;
            const precioTotal = venta.precioVenta * venta.cantidadFrascos;

            // Determinar si la venta ha sido repartida
            const repartido = venta.repartido === true;
            const claseRepartido = repartido ? 'repartido' : '';

            // Crear una nueva fila para cada venta con botón de eliminación
            const row = `
                <tr class="${claseRepartido}">
                    <td>${venta.fechaVenta}</td>
                    <td>${venta.cliente}</td>
                    <td>${venta.cantidadFrascos}</td>
                    <td>$${precioTotal.toFixed(2)}</td>
                    <td>${venta.usuario}</td>
                    <td><button class="btn-eliminar" onclick="eliminarVenta('${key}')">Eliminar</button></td>
                </tr>
            `;
            ventasBody.innerHTML += row;
        });
    });

    // Función para eliminar una venta
    window.eliminarVenta = function (key) {
        if (confirm('¿Estás seguro de que deseas eliminar esta venta?')) {
            // Mover la venta a 'ventasEliminadas'
            db.ref('ventas/' + key).once('value').then((snapshot) => {
                const ventaEliminada = snapshot.val();
                ventaEliminada.eliminadoPor = getCurrentUser().username;
                ventaEliminada.fechaEliminacion = new Date().toLocaleString();
                db.ref('ventasEliminadas').push(ventaEliminada);

                // Eliminar la venta original
                db.ref('ventas/' + key).remove();

                // Actualizar los datos del cliente (restar la cantidad de frascos vendidos)
                const clienteKey = ventaEliminada.clienteKey;
                db.ref('clientes/' + clienteKey).once('value').then((clienteSnapshot) => {
                    const cliente = clienteSnapshot.val();
                    const nuevaCantidadFrascos = cliente.cantidadFrascos - ventaEliminada.cantidadFrascos;
                    db.ref('clientes/' + clienteKey).update({ cantidadFrascos: nuevaCantidadFrascos });
                });

                // Actualizar el stock del usuario (devolver los frascos)
                actualizarStockUsuario(ventaEliminada.usuario, ventaEliminada.cantidadFrascos);
            });
        }
    };

    /*** SECCIÓN DE STOCK ***/
    // Función para cargar el stock de todos los usuarios
    function cargarStock() {
        db.ref('usuarios').once('value').then((snapshot) => {
            const stockBody = document.getElementById('stockBody');
            if (!stockBody) {
                console.error('Elemento con ID "stockBody" no encontrado en el DOM.');
                return;
            }
            stockBody.innerHTML = '';

            snapshot.forEach((childSnapshot) => {
                const userData = childSnapshot.val();
                const username = userData.username;
                const stock = userData.stock || 0;

                const row = `
                    <tr>
                        <td>${username}</td>
                        <td>${stock}</td>
                    </tr>
                `;
                stockBody.innerHTML += row;
            });
        });
    }

    // Función para actualizar el stock del usuario
    function actualizarStockUsuario(username, cantidad) {
        const stockRef = db.ref('usuarios/' + username + '/stock');
        stockRef.transaction((currentStock) => {
            return (currentStock || 0) + cantidad;
        }, function (error, committed, snapshot) {
            if (error) {
                console.log('Error al actualizar el stock:', error);
            } else if (committed) {
                cargarStock(); // Actualizar la tabla de stock
            }
        });
    }

    // Manejar el formulario de stock
    document.getElementById('stockForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        const cantidad = parseInt(document.getElementById('stockInput').value);

        if (isNaN(cantidad)) {
            alert('Por favor, ingresa una cantidad válida.');
            return;
        }

        actualizarStockUsuario(user.username, cantidad);

        // Registrar el gasto si corresponde
        if (cantidad > 0) {
            // Asumiendo que agregar stock genera un gasto
            const gasto = {
                tipo: 'Compra de Stock',
                monto: 0, // Puedes ajustar el monto según tus necesidades
                razon: `Compra de ${cantidad} frascos`,
                fecha: new Date().toLocaleString(),
                timestamp: new Date().getTime(),
                usuario: user.username,
                repartido: false
            };

            db.ref('gastos').push(gasto);
        }

        // Limpiar el formulario
        document.getElementById('stockForm').reset();
    });

    // Actualizar el stock cuando cambie en la base de datos
    db.ref('usuarios').on('value', (snapshot) => {
        cargarStock();
    });

    /*** SECCIÓN DE REPARTO DE GANANCIAS ***/
    /*** SECCIÓN DE REPARTO DE GANANCIAS ***/
// Función para calcular y mostrar el reparto de ganancias
document.getElementById('gananciasForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const user = getCurrentUser();
    if (!user) return;

    const fechaInicioInput = document.getElementById('fechaInicio').value;
    const fechaFinInput = document.getElementById('fechaFin').value;

    if (!fechaInicioInput || !fechaFinInput) {
        alert('Por favor, selecciona ambas fechas.');
        return;
    }

    const fechaInicio = new Date(fechaInicioInput).getTime();
    const fechaFin = new Date(fechaFinInput).getTime() + 86400000 - 1; // Incluir el último día completo

    let socios = {}; // Objeto para almacenar los datos de cada socio

    // Obtener gastos no repartidos en el rango de fechas
    db.ref('gastos').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
        snapshot.forEach((childSnapshot) => {
            const gasto = childSnapshot.val();
            const fechaGasto = gasto.timestamp;

            if (fechaGasto >= fechaInicio && fechaGasto <= fechaFin) {
                const usuario = gasto.usuario;
                if (!socios[usuario]) {
                    socios[usuario] = { username: usuario, totalGastos: 0, totalVentas: 0 };
                }
                socios[usuario].totalGastos += parseFloat(gasto.monto);
            }
        });

        // Obtener ventas no repartidas en el rango de fechas
        db.ref('ventas').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
            snapshot.forEach((childSnapshot) => {
                const venta = childSnapshot.val();
                const fechaVenta = venta.timestamp;

                if (fechaVenta >= fechaInicio && fechaVenta <= fechaFin) {
                    const usuario = venta.usuario;
                    if (!socios[usuario]) {
                        socios[usuario] = { username: usuario, totalGastos: 0, totalVentas: 0 };
                    }
                    socios[usuario].totalVentas += parseFloat(venta.precioVenta) * parseInt(venta.cantidadFrascos);
                }
            });

            // Calcular las ganancias netas de cada socio
            let gananciasTotales = 0;
            let totalGastosGlobal = 0;
            let totalVentasGlobal = 0;
            let detalleSocios = '';

            const sociosArray = [];

            for (let username in socios) {
                const socio = socios[username];
                const gananciaNeta = socio.totalVentas - socio.totalGastos;
                gananciasTotales += gananciaNeta;
                totalGastosGlobal += socio.totalGastos;
                totalVentasGlobal += socio.totalVentas;

                socio.gananciaNeta = gananciaNeta;
                sociosArray.push(socio);

                detalleSocios += `
                <p><strong>${socio.username}</strong></p>
                <p>Gastos: $${socio.totalGastos.toFixed(2)}</p>
                <p>Ventas: $${socio.totalVentas.toFixed(2)}</p>
                <p>Ganancia Neta: $${gananciaNeta.toFixed(2)}</p>
                <hr>`;
            }

            // Calcular la ganancia neta esperada por socio
            const gananciaEsperadaPorSocio = gananciasTotales / sociosArray.length;

            // Calcular cuánto debe recibir o pagar cada socio
            const balances = sociosArray.map(socio => {
                const balance = gananciaEsperadaPorSocio - socio.gananciaNeta;
                return {
                    username: socio.username,
                    balance: balance
                };
            });

            // Determinar quién debe pagar a quién
            let mensajeBalance = '';
            if (balances.length === 2) {
                const [socio1, socio2] = balances;
                if (socio1.balance > 0 && socio2.balance < 0) {
                    mensajeBalance = `El socio ${socio2.username} debe pagar $${(socio1.balance).toFixed(2)} al socio ${socio1.username} para equilibrar las ganancias.`;
                } else if (socio2.balance > 0 && socio1.balance < 0) {
                    mensajeBalance = `El socio ${socio1.username} debe pagar $${(socio2.balance).toFixed(2)} al socio ${socio2.username} para equilibrar las ganancias.`;
                } else {
                    mensajeBalance = 'Ambos socios tienen ganancias equilibradas.';
                }
            } else {
                mensajeBalance = 'No hay suficientes datos de socios para calcular el balance.';
            }

            // Mostrar los resultados
            const gananciasDiv = document.getElementById('gananciasResultado');
            if (!gananciasDiv) {
                console.error('Elemento con ID "gananciasResultado" no encontrado en el DOM.');
                return;
            }
            gananciasDiv.innerHTML = `
            <h3>Detalle por Socio</h3>
            ${detalleSocios}
            <h3>Resumen General</h3>
            <p>Total de Ventas: $${totalVentasGlobal.toFixed(2)}</p>
            <p>Total de Gastos: $${totalGastosGlobal.toFixed(2)}</p>
            <p>Ganancias Totales: $${gananciasTotales.toFixed(2)}</p>
            <h3>Balance entre Socios</h3>
            <p>${mensajeBalance}</p>
        `;

            // Guardar el reparto en Firebase
            const reparto = {
                fechaInicio: new Date(fechaInicio).toLocaleDateString(),
                fechaFin: new Date(fechaFin).toLocaleDateString(),
                totalVentas: totalVentasGlobal,
                totalGastos: totalGastosGlobal,
                gananciasTotales: gananciasTotales,
                detalleSocios: sociosArray, // Almacenar como array
                mensajeBalance: mensajeBalance,
                fechaReparto: new Date().toLocaleString(),
                usuario: user.username
            };

            db.ref('repartos').push(reparto);

            // Marcar las transacciones como repartidas
            // Marcar gastos
            db.ref('gastos').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
                snapshot.forEach((childSnapshot) => {
                    const gasto = childSnapshot.val();
                    const fechaGasto = gasto.timestamp;

                    if (fechaGasto >= fechaInicio && fechaGasto <= fechaFin) {
                        db.ref('gastos/' + childSnapshot.key).update({ repartido: true });
                    }
                });
            });

            // Marcar ventas como repartidas
            db.ref('ventas').orderByChild('repartido').equalTo(false).once('value').then((snapshot) => {
                snapshot.forEach((childSnapshot) => {
                    const venta = childSnapshot.val();
                    const fechaVenta = venta.timestamp;

                    if (fechaVenta >= fechaInicio && fechaVenta <= fechaFin) {
                        db.ref('ventas/' + childSnapshot.key).update({ repartido: true });
                    }
                });
            });

        });
    });
});




    
    /*** SECCIÓN DE ANOTACIONES ***/
    // Función para agregar una anotación
    document.getElementById('anotacionesForm').addEventListener('submit', function (e) {
        e.preventDefault();

        const user = getCurrentUser();
        if (!user) return;

        // Obtener el valor del formulario
        const anotacion = document.getElementById('anotacion').value;
        const fechaAnotacion = new Date().toLocaleString();

        // Crear el objeto anotación
        const nuevaAnotacion = {
            anotacion: anotacion,
            fecha: fechaAnotacion,
            usuario: user.username
        };

        // Guardar la anotación en Firebase
        db.ref('anotaciones').push(nuevaAnotacion);

        // Limpiar el formulario
        document.getElementById('anotacionesForm').reset();
    });

    // Función para mostrar las anotaciones en tiempo real
    db.ref('anotaciones').on('value', (snapshot) => {
        const listaAnotaciones = document.getElementById('listaAnotaciones');
        if (!listaAnotaciones) {
            console.error('Elemento con ID "listaAnotaciones" no encontrado en el DOM.');
            return;
        }
        listaAnotaciones.innerHTML = '';

        snapshot.forEach((childSnapshot) => {
            const anotacion = childSnapshot.val();
            const key = childSnapshot.key;
            listaAnotaciones.innerHTML += `
                <p>
                    ${anotacion.fecha} - ${anotacion.anotacion} - Registrado por: ${anotacion.usuario}
                    <button class="btn-eliminar" onclick="eliminarAnotacion('${key}')">Eliminar</button>
                </p>
            `;
        });
    });

    // Función para eliminar una anotación
    window.eliminarAnotacion = function (key) {
        if (confirm('¿Estás seguro de que deseas eliminar esta anotación?')) {
            // Mover la anotación a 'anotacionesEliminadas'
            db.ref('anotaciones/' + key).once('value').then((snapshot) => {
                const anotacionEliminada = snapshot.val();
                anotacionEliminada.eliminadoPor = getCurrentUser().username;
                anotacionEliminada.fechaEliminacion = new Date().toLocaleString();
                db.ref('anotacionesEliminadas').push(anotacionEliminada);

                // Eliminar la anotación original
                db.ref('anotaciones/' + key).remove();
            });
        }
    };

});

}





